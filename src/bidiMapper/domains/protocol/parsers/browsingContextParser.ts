import { InvalidArgumentErrorResponse } from '../error';
import { BrowsingContext } from '../bidiProtocolTypes';

export namespace BrowsingContextParser {
  export class BrowsingContextParser {
    public static parseOptionalList(
      contexts: any
    ): BrowsingContext.BrowsingContext[] | undefined {
      if (contexts === undefined) return undefined;
      if (!Array.isArray(contexts))
        throw new InvalidArgumentErrorResponse(
          "Wrong format parameter 'contexts'. Not an array."
        );

      return contexts.map((c) => this.parse(c));
    }

    public static parse(context: any): BrowsingContext.BrowsingContext {
      if (context === undefined)
        throw new InvalidArgumentErrorResponse('Context is undefined');
      if (!(context instanceof String) || context.length == 0)
        throw new InvalidArgumentErrorResponse(
          `Context has wrong format ${JSON.stringify(context)}.`
        );

      return context as BrowsingContext.BrowsingContext;
    }
  }
}
