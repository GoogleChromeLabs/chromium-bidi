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

/**
 * @type import("eslint").Rule.RuleModule
 */
const noUninitFieldsRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce initialized Pantry fields.',
      recommended: true,
    },
    fixable: 'code',
  },

  create(context) {
    const fields = new Map();
    return {
      ClassBody(node) {
        for (const definition of node.body) {
          if (definition.type === 'PropertyDefinition') {
            for (const decorator of definition.decorators) {
              switch (decorator.expression.type) {
                case 'CallExpression':
                  if (decorator.expression.callee.name === 'pantry') {
                    fields.set(definition.key.name, ['pantry', definition]);
                  }
                  break;
                case 'Identifier':
                  if (decorator.expression.name === 'feed') {
                    fields.set(definition.key.name, ['feed', definition]);
                  }
                  break;
              }
            }
          }
        }
      },
      PropertyDefinition(node) {
        if (node.value) {
          return;
        }
        for (const decorator of node.decorators) {
          switch (decorator.expression.type) {
            case 'CallExpression':
              if (decorator.expression.callee.name === 'pantry') {
                context.report({
                  node: decorator,
                  message: `Cannot decorate uninitialized field with 'pantry'. Either initialize the field or use 'accessor'.`,
                });
              }
              break;
            case 'Identifier':
              if (decorator.expression.name === 'feed') {
                context.report({
                  node: decorator,
                  message: `Cannot decorate uninitialized field with 'feed'. Either initialize the field or use 'accessor'.`,
                });
              }
              break;
          }
        }
      },
      AssignmentExpression(node) {
        for (const [field, [decorator, definition]] of fields) {
          if (
            node.left.object.type === 'ThisExpression' &&
            node.left.property.name === field
          ) {
            context.report({
              node,
              message: `Cannot assign to field '${field}' which was decorated with '${decorator}'. Either initialize the field or use 'accessor'.`,
              fix(fixer) {
                return fixer.insertTextBefore(definition.key, 'accessor ');
              },
            });
          }
        }
      },
    };
  },
};

/**
 * @type import("eslint").Rule.RuleModule
 */
const readonlyFieldsRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: "Enforce 'readonly' for 'pantry'/'feed'-decorated fields",
      recommended: true,
    },
    fixable: 'code',
  },

  create(context) {
    return {
      PropertyDefinition(node) {
        if (node.readonly) {
          return;
        }
        for (const decorator of node.decorators) {
          for (const name of ['pantry', 'feed', 'eat']) {
            if (decorator.expression.callee.name === name) {
              context.report({
                node: node.key,
                message: `'${name}'-decorated fields should be marked 'readonly'.`,
                fix(fixer) {
                  return fixer.insertTextBefore(node.key, 'readonly ');
                },
              });
            }
          }
        }
      },
    };
  },
};

/**
 * @type import("eslint").Rule.RuleModule
 */
const definiteFieldsRule = {
  meta: {
    type: 'problem',
    docs: {
      description: "Enforce definite fields for 'eat'-decorated fields",
      recommended: true,
    },
    fixable: 'code',
  },

  create(context) {
    return {
      PropertyDefinition(node) {
        if (node.definite) {
          return;
        }
        for (const decorator of node.decorators) {
          if (decorator.expression.callee.name === 'eat') {
            context.report({
              node: node.key,
              message: `'eat'-decorated fields should be marked as definite with '!'.`,
              fix(fixer) {
                return fixer.insertTextAfter(node.key, '!');
              },
            });
          }
        }
      },
    };
  },
};

module.exports = {
  rules: {
    // keep-sorted start
    'pantry/definite-fields': definiteFieldsRule,
    'pantry/no-uninit-fields': noUninitFieldsRule,
    'pantry/readonly-fields': readonlyFieldsRule,
    // keep-sorted end
  },
};
