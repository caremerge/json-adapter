export type primitive = string | number | boolean | null | undefined | bigint;
export default class JsonAdapter {
  private readonly transformers;
  private readonly filters;
  private readonly dictionaries;
  private readonly vars;
  private readonly schema;
  private readonly ops;
  constructor(
    schema: object | object[],
    transformers?: object,
    filters?: object,
    dictionaries?: Record<string, any[][]>,
    vars?: Record<string, any | any[]>,
  );
  private getReadonlyCopy;
  private getSafeTarget;
  private getSafeSchemaObj;
  private getSafeSchema;
  private getDict;
  private getTransformer;
  private getFilter;
  private isOperator;
  private getOperator;
  private isPipelineObj;
  private isPipeline;
  lookupValue(dictionary: string, value: string): any;
  private mapField;
  private mapKey;
  private mapPipeline;
  private mapTransformObject;
  private mapTransformArray;
  private mapTransformWithSchemaObject;
  mapTransform(src: object | object[]): object | object[];
}
