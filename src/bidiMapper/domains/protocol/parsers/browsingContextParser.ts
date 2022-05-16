import { InvalidArgumentErrorResponse } from '../error';
import { BrowsingContext } from '../bidiProtocolTypes';

export class BrowsingContextParser {
  public static parseOptionalList(
    contexts: any
  ): BrowsingContext.BrowsingContext[] | undefined {
    if (contexts === undefined) return undefined;
    if (!Array.isArray(contexts))
      throw new InvalidArgumentErrorResponse(
        "Wrong format parameter 'contexts'. Not an array."
      );

    // Get all the bad values.
    const wrongContexts = contexts.filter((c) => {
      // Return `true` if param is not correct.
      if (!c) return true;
      if (!(c instanceof String)) return true;
      return c.length == 0;
    });
    if (wrongContexts.length > 0)
      throw new InvalidArgumentErrorResponse(
        "Wrong format parameter 'contexts': " + JSON.stringify(wrongContexts)
      );

    return contexts;
  }

  public static parse(context: any): BrowsingContext.BrowsingContext {
    if (context === undefined)
      throw new InvalidArgumentErrorResponse("Missing parameter 'context'.");
    if (!(context instanceof String) || context.length == 0)
      throw new InvalidArgumentErrorResponse(
        "Wrong format parameter 'context': " + JSON.stringify(context)
      );

    return context as BrowsingContext.BrowsingContext;
  }
}
