import { v4 as uuidv4 } from 'uuid';

declare global {
  interface Window {
    __webdriver_evaluate_script: Evaluator;
  }
}

interface JSValue {}

class Evaluator {
  private _knownObjects: Map<string, Object> = new Map();

  constructor() {}

  public serialize(value: any): JSValue {
    return { objectId: uuidv4() };
  }

  public deserialize(value: JSValue): any {}
}

export default function () {
  if (window.__webdriver_evaluate_script === undefined) {
    window.__webdriver_evaluate_script = new Evaluator();
  }
}
