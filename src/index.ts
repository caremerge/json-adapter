import * as dot from 'dot-object';
import * as _ from 'lodash';
import * as debug from 'debug';

const d = debug('json-adapter');
const log = (context: object, msg: any = 'DATA=') => {
  d('**%s** > %O', msg, context);
};

export type primitive = string | number | boolean | null | undefined | bigint;

export default class JsonAdapter {
  private readonly schema: object | object[];
  private readonly ops = {
    $value: true,
    $default: true,
    $var: true,
    $lookup: true,
    $transform: true,
    $concat: true,
    $alt: true,
    $filter: true,
    $iterate: true,
  };
  constructor(
    schema: object | object[],
    private readonly transformers: object = {},
    private readonly filters: object = {},
    private readonly dictionaries: Record<string, any[][]> = {},
    private readonly vars: Record<string, any | any[]> = {},
  ) {
    log(
      { schema, transformers, filters, dictionaries },
      'initialized json-adapter!',
    );
    this.schema = this.getSafeSchema(schema);
  }

  private getReadonlyCopy(obj: any) {
    const _cloned = _.cloneDeep(obj);
    return Object.freeze(_cloned);
  }

  private getSafeTarget() {
    return Object.create(null);
  }

  private getSafeSchemaObj(schemaObj: object) {
    if (!_.isPlainObject(schemaObj)) {
      throw new Error(`Invalid schema! Expected object schema`);
    }
    const _cloned = _.cloneDeep(schemaObj);
    for (const key in _cloned) {
      if (
        key.startsWith('prototype') ||
        key.startsWith('__proto__') ||
        key.startsWith('constructor')
      ) {
        throw new Error(`Invalid schema! ${key} is a reserved property name`);
      }
    }
    return this.getReadonlyCopy(schemaObj);
  }

  private getSafeSchema(schema: object | object[]) {
    if (_.isArray(schema)) {
      return _.map(schema, (subSchema) => this.getSafeSchemaObj(subSchema));
    }
    if (_.isPlainObject(schema)) {
      return this.getSafeSchemaObj(schema);
    }
    throw new Error(`Invalid schema! Expected object or array schema`);
  }

  private getDict(dict: string): any[][] {
    if (!this.dictionaries[dict] || !_.isArray(this.dictionaries[dict])) {
      throw new Error(
        `Invalid dictionary! ${dict} not found or it is not an array`,
      );
    }
    return this.dictionaries[dict] || [];
  }

  private getTransformer(name: string): (primitive) => primitive {
    if (!this.transformers[name] || !_.isFunction(this.transformers[name])) {
      throw new Error(
        `Invalid transformer! ${name} not found or it is not a function`,
      );
    }
    return this.transformers[name];
  }

  private getFilter(name: string): () => boolean {
    if (!this.filters[name] || !_.isFunction(this.filters[name])) {
      throw new Error(
        `Invalid filter! ${name} not found or it is not a function`,
      );
    }
    return this.filters[name];
  }

  private isOperator(op: string): boolean {
    return !!this.ops[op];
  }

  private getOperator(formula: string | object): string {
    if (_.isString(formula)) {
      return formula as string;
    }
    const foundOps = _.filter(_.keys(formula), (key) => this.isOperator(key));
    if (foundOps.length === 0) {
      throw new Error('Invalid formula! No operators found');
    }
    if (foundOps.length > 1) {
      throw new Error('Invalid formula! Multiple operators found');
    }
    return foundOps[0];
  }

  private isPipelineObj(pipelineObj: string | object): boolean {
    if (!_.isString(pipelineObj) && !_.isPlainObject(pipelineObj)) {
      return false;
    }
    return (
      _.isString(pipelineObj) ||
      _.some(_.keys(pipelineObj), (key) => this.isOperator(key))
    );
  }

  private isPipeline(pipeline: any): boolean {
    if (!_.isArray(pipeline)) {
      return false;
    }
    return _.every(pipeline, (obj) => this.isPipelineObj(obj));
  }

  public lookupValue(dictionary: string, value: string) {
    const dict = this.getDict(dictionary);
    let defaultValue = undefined;
    for (const [key, mappedValue] of dict) {
      if (key === value && key !== '*') {
        return mappedValue;
      }
    }
    for (const [key, mappedValue] of dict) {
      if (key !== '*' && key.startsWith('*') && value.endsWith(key.slice(1))) {
        return mappedValue;
      }
    }
    for (const [key, mappedValue] of dict) {
      if (
        key !== '*' &&
        key.endsWith('*') &&
        value.startsWith(key.slice(0, -1))
      ) {
        return mappedValue;
      }
    }
    for (const [key, mappedValue] of dict) {
      if (key === '*') {
        log({ key, mappedValue, value }, 'found *');
        defaultValue = (mappedValue === '*' ? value : mappedValue) as any;
      }
      if (
        key !== '*' &&
        key.startsWith('*') &&
        key.endsWith('*') &&
        value.includes(key.slice(1, -1))
      ) {
        return mappedValue;
      }
    }
    return defaultValue;
  }

  private mapField(
    targetPath: string,
    srcPath: string,
    src: object,
    target: object,
    mods?: any,
  ) {
    dot.str(targetPath, dot.pick(srcPath, src, false), target, mods);
  }

  private mapKey(
    key: string,
    formula: string | object | object[],
    src: Record<string, any>,
    target: Record<string, any>,
  ) {
    if (!formula) {
      throw new Error(`Invalid formula! Formula: ${JSON.stringify(formula)}`);
    }
    if (_.isString(formula)) {
      log({ key, formula, src, target });
      return this.mapField(key, formula as string, src, target);
    }
    if (_.isPlainObject(formula)) {
      if (!this.isPipelineObj(formula)) {
        log({ key, formula, src, target }, 'non-pipeline sub-object');
        const subAdapter = new JsonAdapter(
          formula as any,
          this.transformers,
          this.filters,
          this.dictionaries,
          this.vars,
        );
        const subTarget = subAdapter.mapTransform(src);
        target[key] = subTarget;
        return;
      }
      const op = this.getOperator(formula);
      if (op === '$value') {
        dot.str(key, formula[op], target);
        return;
      }
      if (!formula[op]) {
        throw new Error(
          `Invalid formula! formula[${op}] should not be undefined. Formula: ${JSON.stringify(formula)}`,
        );
      }
      if (op === '$var') {
        dot.str(key, this.vars[formula[op]], target);
        return;
      }
      if (op === '$lookup') {
        if (!_.isString(formula[op])) {
          throw new Error(
            'Invalid $lookup! $lookup key does not contain a string identifier',
          );
        }
        log({ key, formula, src, target });
        this.mapField(
          key,
          key,
          src,
          target,
          this.lookupValue.bind(this, formula[op]),
        );
        return;
      }
      if (op === '$default') {
        log({ key, formula, src, target });
        this.mapField(key, key, src, target, (val) =>
          val === undefined ? formula[op] : val,
        );
        return;
      }
      if (op === '$transform') {
        if (!_.isString(formula[op])) {
          throw new Error(
            'Invalid $transform! $transform key does not contain a string identifier',
          );
        }
        this.mapField(
          key,
          key,
          src,
          target,
          this.getTransformer(formula[op]).bind(src),
        );
        return;
      }
      if (op === '$concat') {
        if (!_.isArray(formula[op])) {
          throw new Error(
            'Invalid $concat! Expected array of pipelines or pipeline objects',
          );
        }
        const concatenatedValue = _.reduce(
          formula[op],
          (acc: any[], pipeline: any) => {
            if (!this.isPipelineObj(pipeline) && !this.isPipeline(pipeline)) {
              throw new Error(
                'Invalid $concat! non-pipeline encountered in $concat array',
              );
            }
            if (this.isPipeline(pipeline)) {
              acc = [...acc, this.mapPipeline(pipeline, src)];
              return acc;
            }
            const tempTarget = {};
            this.mapKey(key, pipeline, src, tempTarget);
            acc = [...acc, dot.pick(key, tempTarget)];
            return acc;
          },
          [],
        );
        dot.str(key, concatenatedValue, target);
        return;
      }
      if (op === '$alt') {
        if (!this.isPipeline(formula[op])) {
          log({ formula }, 'non-pipeline-obj in alt!');
          throw new Error('Invalid $alt! Expected array of pipelines');
        }
        const altValue = _.reduce(
          formula[op],
          (acc, alt) => {
            if (!!acc) {
              return acc;
            }
            const tempTarget = {};
            this.mapKey(key, alt, src, tempTarget);
            const currValue = dot.pick(key, tempTarget);
            if (currValue) {
              return currValue;
            }
            return undefined;
          },
          undefined,
        );
        dot.str(key, altValue, target);
        return;
      }
      if (op === '$filter') {
        if (!_.isString(formula[op])) {
          throw new Error(
            'Invalid $filter! $filter key does not contain a string identifier',
          );
        }
        const shouldKeep = this.getFilter(formula[op]).bind(src)(
          dot.pick(key, src),
        );
        if (shouldKeep) {
          this.mapField(key, key, src, target);
        }
        return;
      }
      if (op === '$iterate') {
        const subKey = formula[op];
        const subSrc = dot.pick(subKey, src);
        if (!_.isArray(subSrc)) {
          throw new Error(
            `Invalid $iterate! Expected array at src path ${subKey} in $iterate`,
          );
        }
        const subSchema = _.cloneDeep(formula);
        delete subSchema['$iterate'];
        log({ subSchema, subKey, subSrc }, 'deleted iterate');
        const subAdapter = new JsonAdapter(
          subSchema,
          this.transformers,
          this.filters,
          this.dictionaries,
          this.vars,
        );
        const subTarget = subAdapter.mapTransform(subSrc);
        dot.str(key, subTarget, target);
      }
      return;
    }
    if (_.isArray(formula) && this.isPipeline(formula)) {
      log({}, 'inside array formula!');
      let currentSrc = this.getReadonlyCopy(src);
      for (const pipeline of formula as any) {
        const currentTarget = this.getSafeTarget();
        this.mapKey(key, pipeline, currentSrc, currentTarget);
        currentSrc = currentTarget;
        log(
          { currentSrc, currentTarget, formula },
          'currentSrc, currentTarget in formula pipeline!',
        );
      }
      dot.str(key, dot.pick(key, currentSrc), target);
      return;
    }

    throw new Error(`Invalid formula! Formula: ${JSON.stringify(formula)}`);
  }

  private mapPipeline(pipeline: any, src: object) {
    log({ pipeline, src }, 'mapping pipeline...');
    const subAdapter = new JsonAdapter(
      { val: pipeline },
      this.transformers,
      this.filters,
      this.dictionaries,
      this.vars,
    );
    const { val } = subAdapter.mapTransform(src) as any;
    return val;
  }

  private mapTransformObject(src: object, target: object): object {
    log({ src, target }, 'src is object! mapping keys...');
    for (const key in this.schema) {
      const formula = this.schema[key];
      log({ src, target, key, formula }, 'mapping schema key!');
      this.mapKey(key, formula, src, target);
    }
    return target;
  }

  private mapTransformArray(src: object[]): object[] {
    log({ src }, 'src is array, iterating...');
    return _.map(src, (item) => {
      const target = this.getSafeTarget();
      this.mapTransformObject(item, target);
      return target;
    });
  }

  private mapTransformWithSchemaObject(src: object | object[]): object {
    let target: any;
    if (_.isPlainObject(src)) {
      target = this.getSafeTarget();
      this.mapTransformObject(src, target);
    } else if (_.isArray(src)) {
      target = this.mapTransformArray(src);
    } else {
      throw new Error(
        'Unsupported source type! Only object and array are supported at top-level',
      );
    }
    return target;
  }

  mapTransform(src: object | object[]): object | object[] {
    const _src = this.getReadonlyCopy(src);
    log({ _src, schema: this.schema }, 'mapTransform called!');
    if (_.isPlainObject(this.schema)) {
      log({}, 'inside plain object schema!');
      const target = this.mapTransformWithSchemaObject(_src);
      log({ target }, '||result||');
      return target;
    }
    if (_.isArray(this.schema)) {
      log({}, 'inside array schema!');
      let currSrc = this.getReadonlyCopy(_src);
      let currTarget = this.getSafeTarget();
      for (const subSchema of this.schema as any) {
        const _subSchema = this.getSafeSchema(subSchema);
        const subAdapter = new JsonAdapter(
          _subSchema,
          this.transformers,
          this.filters,
          this.dictionaries,
          this.vars,
        );
        currTarget = subAdapter.mapTransform(currSrc);
        currSrc = currTarget;
      }
      const target = currTarget;
      log({ target }, '||result||');
      return target;
    }
    throw new Error(`Invalid schema! Expected object or array schema`);
  }
}
