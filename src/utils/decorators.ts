/* eslint-disable @typescript-eslint/no-empty-function */
/**
 * Copyright 2023 Google LLC.
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

type ClassMemberDecoratorContext<This, Value> =
  | ClassGetterDecoratorContext<This, Value>
  | ClassSetterDecoratorContext<This, Value>
  | ClassFieldDecoratorContext<This, Value>
  | ClassAccessorDecoratorContext<This, Value>;

type InjectableKey =
  | (abstract new (...args: any[]) => any)
  | keyof InjectableRegistry;

type ValueOf<Marker extends InjectableKey> =
  Marker extends keyof InjectableRegistry
    ? InjectableRegistry[Marker]
    : Marker extends abstract new (...args: any[]) => any
    ? InstanceType<Marker>
    : never;

export const Required = Symbol('Required');

/**
 * Augment this to register your injectables.
 *
 * For example,
 *
 * ```ts
 * const LoggerSym = Symbol('symbol');
 *
 * declare module './path/to/decorators.js' {
 *  interface InjectableRegistry {
 *    [LoggerSym]: Logger;
 *   }
 * }
 * ```
 */
export interface InjectableRegistry {}

type Consumer = {
  getters: Map<InjectableKey, () => any>;
  fields: Map<string | symbol, object>;
};

type Provider = Map<
  InjectableKey,
  [(value: any) => void, ...((value: any) => void)[]]
>;

const STATES = new WeakMap<
  abstract new (...args: unknown[]) => unknown,
  {
    consumers?: WeakMap<object, Consumer>;
    providers?: WeakMap<object, Provider>;
  }
>();

function getInjectorState(object: object) {
  const Class = object.constructor as abstract new (
    ...args: unknown[]
  ) => unknown;
  let state = STATES.get(Class);
  if (!state) {
    state = {};
    STATES.set(Class, state);
  }
  return state;
}

function getOrCreateProvider(object: object) {
  const state = getInjectorState(object);
  state.providers ??= new WeakMap();

  const providers = state.providers;
  let provider = providers.get(object);
  if (!provider) {
    provider = new Map();
    providers.set(object, provider);
  }
  return provider;
}

function getProvider(object: object) {
  const state = getInjectorState(object);
  state.providers ??= new WeakMap();

  const providers = state.providers;
  return providers.get(object);
}

function getOrCreateConsumers(object: object) {
  const state = getInjectorState(object);
  state.consumers ??= new WeakMap();

  const consumers = state.consumers;
  let consumer = consumers.get(object);
  if (!consumer) {
    consumer = {getters: new Map(), fields: new Map()};
    consumers.set(object, consumer);
  }
  return consumer;
}

function getConsumers(object: object) {
  const state = getInjectorState(object);
  state.consumers ??= new WeakMap();

  const consumers = state.consumers;
  return consumers.get(object);
}

/**
 * Injects the decorated member with objects associated with the given symbols.
 *
 * Before injecting a given symbol, make sure it's registered with
 * {@link InjectableRegistry}.
 */
export function feed(marks: InjectableKey[] | typeof Required) {
  let cachedMarks = Array.isArray(marks) ? marks : undefined;
  return (
    target: any,
    context: ClassMemberDecoratorContext<object, object>
  ): any => {
    let consumers: Consumer;
    context.addInitializer(function initializer() {
      consumers = getOrCreateConsumers(this);

      if (cachedMarks !== undefined) {
        const provider = getOrCreateProvider(this);
        for (const mark of cachedMarks) {
          const setters = provider.get(mark) ?? [() => {}];
          setters[0] = memoize(reinject.bind(undefined, consumers, mark));
          provider.set(mark, setters);
        }
      }
    });

    switch (context.kind) {
      case 'accessor':
        return {
          set(this: object, value?: object) {
            return target.set.call(this, inject(value));
          },
          init: inject,
        };
      case 'field':
        return inject;
      case 'setter':
        return function set(this: object, value?: object) {
          return target.call(this, inject(value));
        };
      case 'getter':
        return function get(this: object) {
          return inject(target.call(this));
        };
    }

    function inject(object?: object) {
      if (object !== undefined) {
        const provider = getProvider(object);
        if (provider !== undefined) {
          consumers.fields.set(context.name, object);
          if (cachedMarks === undefined) {
            cachedMarks = [...getInjectableKeys(object)];
          }
          for (const mark of cachedMarks) {
            const get = consumers.getters.get(mark);
            if (get !== undefined) {
              const setters = provider.get(mark)!;
              if (setters !== undefined) {
                for (const set of setters) {
                  set(get());
                }
              }
            }
          }
        }
      }
      return object;
    }
  };
}

/**
 * Declares a member as an object provider for the given symbol.
 *
 * Before injecting a given symbol, make sure it's registered with
 * {@link InjectableRegistry}.
 */
export function pantry<Marker extends InjectableKey>(mark: Marker) {
  return <
    Interface,
    Value = ValueOf<Marker> extends Interface ? Interface : ValueOf<Marker>,
  >(
    target: any,
    context: ClassMemberDecoratorContext<object, Value>
  ): any => {
    let consumers: Consumer;
    context.addInitializer(function initializer() {
      consumers = getOrCreateConsumers(this);
      switch (context.kind) {
        case 'getter':
          consumers.getters.set(mark, context.access.get.bind(undefined, this));
          break;
        default:
      }
    });

    switch (context.kind) {
      case 'accessor':
        return {
          set(this: object, value: Value) {
            return target.set.call(this, reinject(consumers, mark, value));
          },
          init(this: object, initialValue: Value) {
            consumers.getters.set(
              mark,
              context.access.get.bind(undefined, this)
            );
            return reinject(consumers, mark, initialValue);
          },
        };
      case 'field':
        return function init(this: object, initialValue: Value) {
          consumers.getters.set(mark, context.access.get.bind(undefined, this));
          return reinject(consumers, mark, initialValue);
        };
      case 'getter':
        break;
      default:
        throw new Error(`Cannot decorate ${context.kind}`);
    }
  };
}

/**
 * Declares a member as an object consumer for the given symbol.
 *
 * Before injecting a given symbol, make sure it's registered with
 * {@link InjectableRegistry}.
 */
export function eat<Marker extends InjectableKey>(mark: Marker) {
  return <
    Interface,
    Value = ValueOf<Marker> extends Interface ? Interface : ValueOf<Marker>,
  >(
    _: unknown,
    context: ClassMemberDecoratorContext<object, Value>
  ): any => {
    context.addInitializer(function initializer() {
      const provider = getOrCreateProvider(this);
      switch (context.kind) {
        case 'field':
        case 'setter':
        case 'accessor': {
          const setters = provider.get(mark) ?? [() => {}];
          setters.push(memoize(context.access.set.bind(undefined, this)));
          provider.set(mark, setters);
          break;
        }
        default:
          throw new Error(`Cannot decorate ${context.kind}`);
      }
    });
  };
}

/**
 * For testing only! Injects a given object with a provided set of injectables.
 *
 * This must not be used to "skip" constructor arguments in favor of injection.
 *
 * For example, if you need to inject a `Logger` module into some class, do
 *
 * ```ts
 * class A {
 *  @pantry(LoggerSym)
 *  #logger: Logger
 *
 *  constructor(logger: Logger) {
 *    this.#logger = logger;
 *  }
 * }
 *
 * const a = new A(new Logger());
 * ```
 *
 * Do not do
 *
 * ```ts
 * class A {
 *  @eat(LoggerSym)
 *  #logger: Logger
 *
 *  constructor(logger: Logger) {
 *    this.#logger = logger;
 *  }
 * }
 *
 * const a = inject(new A());
 * ```
 *
 * If you need to pass some object to some descendent, you should declare
 * the object on the root class, even if it's not used by the root class.
 *
 */
export function inject<
  T extends object,
  Injectables extends Partial<InjectableRegistry> | Set<object>,
>(object: T, injectables: Injectables): T {
  const provider = getProvider(object);
  if (provider !== undefined) {
    if (injectables instanceof Set) {
      for (const object of injectables) {
        const setters = provider.get(object.constructor);
        if (setters !== undefined) {
          for (const set of setters) {
            set(object);
          }
        }
      }
    } else {
      for (const mark of Object.getOwnPropertySymbols(
        injectables
      ) as (keyof InjectableRegistry)[]) {
        const setters = provider.get(mark);
        if (setters !== undefined) {
          for (const set of setters) {
            set(injectables[mark]);
          }
        }
      }
    }
  }
  return object;
}

function reinject<
  Marker extends InjectableKey,
  Interface,
  Value = ValueOf<Marker> extends Interface ? Interface : ValueOf<Marker>,
>(consumer: Consumer, mark: Marker, value: Value) {
  for (const object of consumer.fields.values()) {
    // SAFETY: Being in consumer.field implies this object has a provider.
    const provider = getProvider(object)!;
    const setters = provider.get(mark);
    if (setters !== undefined) {
      for (const set of setters) {
        set(value);
      }
    }
  }
  return value;
}

function getInjectableKeys(source: object) {
  const keys = new Set<InjectableKey>();
  const consumer = getConsumers(source);
  if (consumer !== undefined) {
    for (const child of consumer.fields.values()) {
      for (const key of getInjectableKeys(child)) {
        keys.add(key);
      }
      const provider = getProvider(child);
      if (provider !== undefined) {
        for (const mark of provider.keys()) {
          keys.add(mark);
        }
      }
    }
    const provider = getOrCreateProvider(source);
    for (const mark of keys) {
      const setters = provider.get(mark) ?? [() => {}];
      setters[0] = memoize(reinject.bind(undefined, consumer, mark));
      provider.set(mark, setters);
    }
  }
  return keys;
}

function memoize<T>(fn: (value: T) => void) {
  let lastValue: T | undefined = undefined;
  return (value: T) => {
    if (value !== lastValue) {
      fn(value);
      lastValue = value;
    }
  };
}
