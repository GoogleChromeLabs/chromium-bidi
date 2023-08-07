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

import * as chai from 'chai';

import {feed, eat, pantry} from './decorators.js';

const expect = chai.expect;

const SymbolSym = Symbol('symbol');
const SymbolSym2 = Symbol('symbol2');

declare module './decorators.js' {
  interface InjectableRegistry {
    [SymbolSym]: symbol;
    [SymbolSym2]: symbol;
  }
}

describe('Decorators', () => {
  describe('inject: field, provides: field, consumes: field', () => {
    it('should work', () => {
      class A {
        @pantry(SymbolSym)
        readonly value = Symbol();

        @feed
        readonly b = new B();
      }

      class B {
        @eat(SymbolSym)
        readonly value!: symbol;
      }

      const a = new A();
      expect(a.b.value).equals(a.value);
    });

    it('should work out of order', () => {
      class A {
        @feed
        readonly b = new B();

        @pantry(SymbolSym)
        readonly value = Symbol();
      }

      class B {
        @eat(SymbolSym)
        readonly value!: symbol;
      }

      const a = new A();
      expect(a.b.value).equals(a.value);
    });

    it('should not work with constructors', () => {
      class A {
        // eslint-disable-next-line local/pantry/no-uninit-fields
        @pantry(SymbolSym)
        readonly value: symbol;

        @feed
        readonly b: B;

        constructor() {
          // eslint-disable-next-line local/pantry/no-uninit-fields
          this.value = Symbol();
          // eslint-disable-next-line local/pantry/no-uninit-fields
          this.b = new B();
        }
      }

      class B {
        @eat(SymbolSym)
        readonly value!: symbol;
      }

      const a = new A();
      expect(a.b.value).equals(undefined);
    });

    it('should not descend modifications', () => {
      class A {
        @pantry(SymbolSym)
        readonly value = Symbol();

        @feed
        readonly b = new B();
      }

      class B {
        @eat(SymbolSym)
        readonly value!: symbol;
      }

      const a = new A();
      // @ts-expect-error We are trying to do something bad here.
      a.value = Symbol();
      expect(a.b.value).not.equals(a.value);
    });

    it('should not reinject', () => {
      class A {
        @pantry(SymbolSym)
        readonly value = Symbol();

        @feed
        readonly b = new B();
      }

      class B {
        @eat(SymbolSym)
        readonly value!: symbol;
      }

      const a = new A();
      // @ts-expect-error We are trying to do something bad here.
      a.b = new B();
      expect(a.b.value).equals(undefined);
    });
  });

  describe('inject: setter/getter, provides: getter, consumes: setter', () => {
    it('should work with injected setters', () => {
      class A {
        @pantry(Number)
        get value() {
          return 5;
        }

        internalB?: B;
        @feed
        set b(value: B) {
          this.internalB = value;
        }
      }

      class B {
        internalValue?: number;
        @eat(Number)
        set value(value: number) {
          this.internalValue = value;
        }
      }

      const a = new A();
      expect(a.internalB).equals(undefined);

      const b = new B();
      expect(b.internalValue).equals(undefined);

      a.b = b;
      expect(a.internalB).equals(b);
      expect(b.internalValue).equals(a.value);
    });

    it('should work with injected getters', () => {
      class A {
        @pantry(Number)
        get value() {
          return 5;
        }

        @feed
        get b() {
          return new B();
        }
      }

      class B {
        internalValue?: number;
        @eat(Number)
        set value(value: number) {
          this.internalValue = value;
        }
      }

      const a = new A();
      expect(a.b.internalValue).equals(a.value);
    });
  });

  describe('inject: accessor, provides: accessor, consumes: accessor', () => {
    it('should work', () => {
      class A {
        @pantry(SymbolSym)
        accessor value = Symbol();

        @feed
        accessor b = new B();
      }

      class B {
        @eat(SymbolSym)
        accessor value!: symbol;
      }

      const a = new A();
      expect(a.b.value).equals(a.value);
    });

    it('should work out of order', () => {
      class A {
        @feed
        accessor b = new B();

        @pantry(SymbolSym)
        accessor value = Symbol();
      }

      class B {
        @eat(SymbolSym)
        accessor value!: symbol;
      }

      const a = new A();
      expect(a.b.value).equals(a.value);
    });

    it('should work with constructors', () => {
      class A {
        @pantry(SymbolSym)
        accessor value: symbol;

        @feed
        accessor b: B;

        constructor() {
          // eslint-disable-next-line local/pantry/no-uninit-fields
          this.value = Symbol();
          // eslint-disable-next-line local/pantry/no-uninit-fields
          this.b = new B();
        }
      }

      class B {
        @eat(SymbolSym)
        accessor value!: symbol;
      }

      const a = new A();
      expect(a.b.value).equals(a.value);
    });

    it('should descend modifications', () => {
      class A {
        @pantry(SymbolSym)
        accessor value = Symbol();

        @feed
        accessor b = new B();
      }

      class B {
        @eat(SymbolSym)
        accessor value!: symbol;
      }

      const a = new A();
      a.value = Symbol();
      expect(a.b.value).equals(a.value);
    });

    it('should reinject', () => {
      class A {
        @pantry(SymbolSym)
        accessor value = Symbol();

        @feed
        accessor b = new B();
      }

      class B {
        @eat(SymbolSym)
        accessor value!: symbol;
      }

      const a = new A();
      a.b = new B();
      expect(a.b.value).equals(a.value);
    });
  });

  describe('inject: field, provides: accessor, consumes: accessor', () => {
    it('should not work out of order in constructor', () => {
      class A {
        @feed
        accessor b: B;

        // eslint-disable-next-line local/pantry/no-uninit-fields
        @pantry(SymbolSym)
        readonly value: symbol;

        constructor() {
          // eslint-disable-next-line local/pantry/no-uninit-fields
          this.b = new B();
          // eslint-disable-next-line local/pantry/no-uninit-fields
          this.value = Symbol();
        }
      }

      class B {
        @eat(SymbolSym)
        accessor value!: symbol;
      }

      const a = new A();
      expect(a.b.value).equals(undefined);
    });
  });

  it('should work with multiple', () => {
    class A {
      @pantry(SymbolSym)
      accessor value = Symbol();
      @pantry(SymbolSym2)
      accessor value2 = Symbol();

      @feed
      accessor b = new B();
    }

    class B {
      @eat(SymbolSym)
      accessor value!: symbol;
      @eat(SymbolSym2)
      accessor value2!: symbol;
    }

    const a = new A();
    expect(a.b.value).equals(a.value);
    expect(a.b.value2).equals(a.value2);
  });

  it('should work with private properties', () => {
    class A {
      @pantry(SymbolSym)
      accessor #value = Symbol();

      get value(): symbol {
        return this.#value;
      }

      @feed
      accessor #b = new B();

      get b(): B {
        return this.#b;
      }
    }

    class B {
      @eat(SymbolSym)
      accessor #value!: symbol;

      get value(): symbol {
        return this.#value;
      }
    }

    const a = new A();
    expect(a.b.value).equals(a.value);
  });

  it('should work with consumer setter', () => {
    class A {
      @pantry(SymbolSym)
      accessor value = Symbol();

      @feed
      accessor b = new B();
    }

    class B {
      @eat(SymbolSym)
      set value(value: symbol) {
        this.value2 = value;
      }

      value2!: symbol;
    }

    const a = new A();
    expect(a.b.value2).equals(a.value);
  });

  it('should work not have properties before constructor is used', () => {
    class A {
      @pantry(SymbolSym)
      accessor value = Symbol();

      @feed
      accessor b = new B();
    }

    class B {
      @eat(SymbolSym)
      accessor value!: symbol;

      accessor value2: symbol;

      constructor() {
        this.value2 = this.value;
      }
    }

    const a = new A();
    expect(a.b.value2).equals(undefined);
  });

  describe('nesting', () => {
    it('should work', () => {
      class A {
        @pantry(SymbolSym)
        accessor value = Symbol();

        @feed
        accessor b = new B();
      }

      class B {
        @eat(SymbolSym)
        @pantry(SymbolSym)
        accessor bValue!: symbol;

        @feed
        accessor c = new C();
      }

      class C {
        @eat(SymbolSym)
        accessor cValue!: symbol;
      }

      const a = new A();
      expect(a.b.bValue).equals(a.value);
      expect(a.b.c.cValue).equals(a.value);

      a.value = Symbol();
      expect(a.b.bValue).equals(a.value);
      expect(a.b.c.cValue).equals(a.value);
    });

    it('should work deeply', () => {
      class A {
        @pantry(SymbolSym)
        accessor value = Symbol();

        @feed
        accessor b = new B();
      }

      class B {
        @feed
        accessor c = new C();
      }

      class C {
        @feed
        accessor d = new D();
      }

      class D {
        @eat(SymbolSym)
        accessor dValue!: symbol;
      }

      const a = new A();
      expect(a.b.c.d.dValue).equals(a.value);

      a.value = Symbol();
      expect(a.b.c.d.dValue).equals(a.value);
    });
  });

  it('should work with multiple consumers', () => {
    class A {
      @pantry(SymbolSym)
      accessor value = Symbol();

      @feed
      accessor b = new B();
    }

    class B {
      @eat(SymbolSym)
      accessor bValue!: symbol;

      @eat(SymbolSym)
      accessor bValue2!: symbol;
    }

    const a = new A();
    expect(a.b.bValue).equals(a.value);
    expect(a.b.bValue2).equals(a.value);

    a.value = Symbol();
    expect(a.b.bValue).equals(a.value);
    expect(a.b.bValue2).equals(a.value);
  });

  describe('Required', () => {
    it('should work', () => {
      class A {
        @pantry(SymbolSym)
        accessor value = Symbol();
        @pantry(SymbolSym2)
        accessor value2 = Symbol();

        @feed
        accessor b = new B();
      }

      class B {
        @eat(SymbolSym)
        accessor bValue!: symbol;

        @feed
        accessor c = new C();
      }

      class C {
        @eat(SymbolSym)
        accessor cValue!: symbol;

        @eat(SymbolSym2)
        accessor cValue2!: symbol;
      }

      const a = new A();
      expect(a.b.bValue).equals(a.value);
      expect(a.b.c.cValue).equals(a.value);
      expect(a.b.c.cValue2).equals(a.value2);
    });
  });
});
