import * as _ from 'lodash';
import * as debug from 'debug';
import JsonAdapter from './index';

const log = debug('json-adapter');

describe('index', () => {
  beforeEach(() => {
    log('===============================================');
  });
  it('should export JsonAdapter', () => {
    expect(JsonAdapter).toBeDefined();
  });
});

describe('JsonAdapter - lookupValue', () => {
  let adapter: JsonAdapter;

  beforeEach(() => {
    // Mock schema and initialize JsonAdapter
    const schema = {};
    adapter = new JsonAdapter(
      schema,
      {},
      {},
      {
        sampleDict: [
          ['key1', 'value1'],
          ['key2', 'value2'],
          ['*', 'defaultValue'],
        ],
      },
    );
  });

  it('should return the mapped value for an exact match', () => {
    const result = adapter.lookupValue('sampleDict', 'key1');
    expect(result).toBe('value1');
  });

  it('should undefined if value is undefined', () => {
    const result = adapter.lookupValue('sampleDict', undefined);
    expect(result).toBe(undefined);
  });

  it('should null if value is null', () => {
    const result = adapter.lookupValue('sampleDict', null);
    expect(result).toBe(null);
  });

  it('should return the default value if no match is found', () => {
    const result = adapter.lookupValue('sampleDict', 'unknownKey');
    expect(result).toBe('defaultValue');
  });

  it('should throw an error if the dictionary is not found', () => {
    expect(() => adapter.lookupValue('invalidDict', 'key1')).toThrow(
      'Invalid dictionary! invalidDict not found or it is not an array',
    );
  });

  it('should return the mapped value for a "starts with" wildcard match', () => {
    const schema = {};
    adapter = new JsonAdapter(
      schema,
      {},
      {},
      {
        wildcardDict: [['*End', 'matchedValue']],
      },
    );
    const result = adapter.lookupValue('wildcardDict', 'someEnd');
    expect(result).toBe('matchedValue');
  });

  it('should return the mapped value for an "ends with" wildcard match', () => {
    const schema = {};
    adapter = new JsonAdapter(
      schema,
      {},
      {},
      {
        wildcardDict: [['start*', 'matchedValue']],
      },
    );
    const result = adapter.lookupValue('wildcardDict', 'startSomething');
    expect(result).toBe('matchedValue');
  });

  it('should return the mapped value for a "contains" wildcard match', () => {
    const schema = {};
    adapter = new JsonAdapter(
      schema,
      {},
      {},
      {
        wildcardDict: [['*Middle*', 'matchedValue']],
      },
    );
    const result = adapter.lookupValue(
      'wildcardDict',
      'inTheMiddleOfSomething',
    );
    expect(result).toBe('matchedValue');
  });

  it('should prioritize exact match over wildcard match', () => {
    const schema = {};
    adapter = new JsonAdapter(
      schema,
      {},
      {},
      {
        priorityDict: [
          ['*Key*', 'wildcardValue'],
          ['exactKey', 'exactValue'],
        ],
      },
    );
    const result = adapter.lookupValue('priorityDict', 'exactKey');
    expect(result).toBe('exactValue');
  });

  it('should handle empty dictionaries gracefully', () => {
    const schema = {};
    adapter = new JsonAdapter(schema, {}, {}, { emptyDict: [] });
    const result = adapter.lookupValue('emptyDict', 'anyKey');
    expect(result).toBe(undefined);
  });

  it('should return the undefined in case of no-match if no wildcard is specified', () => {
    const schema = {};
    adapter = new JsonAdapter(
      schema,
      {},
      {},
      {
        wildcardDict: [['nokey', 'novalue']],
      },
    );
    const result = adapter.lookupValue('wildcardDict', 'testKey');
    expect(result).toBe(undefined);
  });

  it('should return the mapped value if a blanket wildcard is specified', () => {
    const schema = {};
    adapter = new JsonAdapter(
      schema,
      {},
      {},
      {
        wildcardDict: [
          ['nokey', 'novalue'],
          ['*', 'matchedValue'],
        ],
      },
    );
    const result = adapter.lookupValue('wildcardDict', 'testKey');
    expect(result).toBe('matchedValue');
  });

  it('should return the same value if a blanket wildcard is specified with a blanket match target', () => {
    const schema = {};
    adapter = new JsonAdapter(
      schema,
      {},
      {},
      {
        wildcardDict: [
          ['nokey', 'novalue'],
          ['*', '*'],
        ],
      },
    );
    const result = adapter.lookupValue('wildcardDict', 'testKey');
    expect(result).toBe('testKey');
  });
});

describe('baseline tests', () => {
  beforeEach(() => {
    log('===============================================');
  });
  it('should map fields based on schema', () => {
    const schema = { name: 'fullName', age: 'years' };
    const adapter = new JsonAdapter(schema);

    const result = adapter.mapTransform({ fullName: 'John Doe', years: 30 });

    expect(result).toEqual({ name: 'John Doe', age: 30 });
  });

  it('should handle nested fields in schema', () => {
    const schema = {
      'user.name': 'userProfile.name',
      'user.age': 'userProfile.age',
    };
    const adapter = new JsonAdapter(schema);

    const result = adapter.mapTransform({
      userProfile: { name: 'Jane Doe', age: 40 },
    });

    expect(result).toEqual({ user: { name: 'Jane Doe', age: 40 } });
  });

  it('should transform fields using $value operator', () => {
    const schema = { status: { $value: 'active' } };
    const adapter = new JsonAdapter(schema);

    const result = adapter.mapTransform({});

    expect(result).toEqual({ status: 'active' });
  });

  it('should not apply default using $default operator when value exists', () => {
    const schema = { status: [{ $value: 'active' }, { $default: 'inactive' }] };
    const adapter = new JsonAdapter(schema);

    const result = adapter.mapTransform({});

    expect(result).toEqual({ status: 'active' });
  });

  it('should apply default using $default operator when value is undefined', () => {
    const schema = {
      status: [{ $value: undefined }, { $default: 'inactive' }],
    };
    const adapter = new JsonAdapter(schema);

    const result = adapter.mapTransform({});

    expect(result).toEqual({ status: 'inactive' });
  });

  it('should apply default using $default operator when value is undefined (col case)', () => {
    const schema = { status: ['status', { $default: 'inactive' }] };
    const adapter = new JsonAdapter(schema);

    const result = adapter.mapTransform({});

    expect(result).toEqual({ status: 'inactive' });
  });

  it('should not apply default using $default operator when value is null (col case)', () => {
    const schema = { status: ['status', { $default: 'inactive' }] };
    const adapter = new JsonAdapter(schema);

    const result = adapter.mapTransform({ status: null });

    expect(result).toEqual({ status: null });
  });

  it('should replace values using $var operator', () => {
    const schema = { status: { $var: 'currentStatus' } };
    const vars = { currentStatus: 'online' };
    const adapter = new JsonAdapter(schema, {}, {}, {}, vars);

    const result = adapter.mapTransform({});

    expect(result).toEqual({ status: 'online' });
  });

  it('should apply transformations with $transform operator', () => {
    const schema = { message: { $transform: 'toUppercase' } };
    const transformers = {
      toUppercase: (value: string) => value.toUpperCase(),
    };
    const adapter = new JsonAdapter(schema, transformers);

    const result = adapter.mapTransform({ message: 'hello world' });

    expect(result).toEqual({ message: 'HELLO WORLD' });
  });

  it('should use $lookup to replace values from dictionary', () => {
    const schema = { gender: { $lookup: 'genderDict' } };
    const dictionaries = {
      genderDict: [
        ['M', 'Male'],
        ['F', 'Female'],
      ],
    };
    const adapter = new JsonAdapter(schema, {}, {}, dictionaries);

    const result = adapter.mapTransform({ gender: 'M' });

    expect(result).toEqual({ gender: 'Male' });
  });

  it('should concatenate values using $concat operator', () => {
    const schema = { fullName: { $concat: ['firstName', 'lastName'] } };
    const adapter = new JsonAdapter(schema);

    const result = adapter.mapTransform({ firstName: 'John', lastName: 'Doe' });

    expect(result).toEqual({ fullName: ['John', 'Doe'] });
  });

  it('should choose the first valid alternative with $alt operator', () => {
    const schema = {
      contact: { $alt: ['phone', 'email'] },
    };
    const adapter = new JsonAdapter(schema);

    const result = adapter.mapTransform({
      phone: null,
      email: 'user@example.com',
    });

    expect(result).toEqual({ contact: 'user@example.com' });
  });

  it('should include keys conditionally with $filter operator', () => {
    const schema = { contact: { $filter: 'isPhoneAvailable' } };
    const filters = { isPhoneAvailable: (value: any) => !!value };
    const adapter = new JsonAdapter(schema, {}, filters);

    const result = adapter.mapTransform({ contact: '1234567890' });

    expect(result).toEqual({ contact: '1234567890' });
  });

  it('should transform arrays with $iterate operator', () => {
    const schema = {
      items: {
        $iterate: 'items',
        name: 'productName',
        price: 'productPrice',
      },
    };
    const adapter = new JsonAdapter(schema);

    const result = adapter.mapTransform({
      items: [
        { productName: 'Item1', productPrice: 10 },
        { productName: 'Item2', productPrice: 20 },
      ],
    });

    expect(result).toEqual({
      items: [
        { name: 'Item1', price: 10 },
        { name: 'Item2', price: 20 },
      ],
    });
  });

  it('should throw error for unsupported source types', () => {
    const schema = {};
    const adapter = new JsonAdapter(schema);

    expect(() => adapter.mapTransform(null as any)).toThrow(
      'Unsupported source type! Only object and array are supported at top-level',
    );
  });
});

describe('tests w/ src structure variation', () => {
  beforeEach(() => {
    log('===============================================');
  });

  it('should map first-level keys', function () {
    const schema = {
      foo: 'bar',
      baz: 'qux',
    };
    const adapter = new JsonAdapter(schema);
    const result = adapter.mapTransform({ bar: 1, qux: 2 });
    expect(result).toEqual({
      foo: 1,
      baz: 2,
    });
  });
  it('should map nested keys', function () {
    const schema = {
      'foo.bar.baz': 'bar.baz.foo',
      'baz.qux.bar': 'foo.bar.qux',
    };
    const adapter = new JsonAdapter(schema);
    const result = adapter.mapTransform({
      bar: {
        baz: {
          foo: 1,
        },
      },
      foo: {
        bar: {
          qux: 2,
        },
      },
    });
    expect(result).toEqual({
      foo: {
        bar: {
          baz: 1,
        },
      },
      baz: {
        qux: {
          bar: 2,
        },
      },
    });
  });
  it('should map $var', function () {
    const schema = {
      foo: { $var: 'foo_name' },
      'bar.bell': { $var: 'bar_bell_name' },
      baz: {
        qux: { $var: 'baz_qux_name' },
      },
    };
    const adapter = new JsonAdapter(
      schema,
      {},
      {},
      {},
      {
        foo_name: 1,
        bar_bell_name: 'bar_bell_name',
        baz_qux_name: true,
      },
    );
    const result = adapter.mapTransform({ bar: 1, qux: 2 });
    expect(result).toEqual({
      foo: 1,
      bar: {
        bell: 'bar_bell_name',
      },
      baz: {
        qux: true,
      },
    });
  });
  it('should transform $value', function () {
    const schema = {
      foo: { $value: 'toss' },
      'bar.bell': { $value: 'bat' },
      baz: {
        qux: { $value: 'bun' },
      },
    };
    const adapter = new JsonAdapter(schema);
    const result = adapter.mapTransform({ bar: 1, qux: 2 });
    expect(result).toEqual({
      foo: 'toss',
      bar: {
        bell: 'bat',
      },
      baz: {
        qux: 'bun',
      },
    });
  });
  it('should transform $transform', function () {
    const schema = {
      foo: { $transform: 'isString' },
      'bar.bell': { $transform: 'toUppercase' },
      baz: {
        qux: ['baz.qux', { $transform: 'toLowercase' }],
      },
    };
    const adapter = new JsonAdapter(schema, {
      isString: _.isString,
      toUppercase: _.toUpper,
      toLowercase: _.toLower,
    });
    const result = adapter.mapTransform({
      foo: 'abc',
      bar: { bell: 'dEf' },
      baz: { qux: 'GhI' },
    });
    expect(result).toEqual({
      foo: true,
      bar: {
        bell: 'DEF',
      },
      baz: {
        qux: 'ghi',
      },
    });
  });
  it('should transform $concat', function () {
    const schema = {
      foo: {
        $concat: [
          'foo',
          'bar.bell',
          'baz.qux',
          { $transform: 'toUppercase' },
          { $transform: 'toLowercase' },
        ],
      },
      'bar.bell': {
        $concat: [
          'foo',
          'bar.bell',
          'baz.qux',
          { $transform: 'toUppercase' },
          { $transform: 'toLowercase' },
        ],
      },
      baz: {
        qux: {
          $concat: [
            'foo',
            'bar.bell',
            'baz.qux',
            ['baz.qux', { $transform: 'toUppercase' }],
            ['baz.qux', { $transform: 'toLowercase' }],
          ],
        },
      },
    };
    const adapter = new JsonAdapter(schema, {
      isString: _.isString,
      toUppercase: _.toUpper,
      toLowercase: _.toLower,
    });
    const result = adapter.mapTransform({
      foo: 'abc',
      bar: {
        bell: 'dEf',
      },
      baz: {
        qux: 'GhI',
      },
    });
    expect(result).toEqual({
      foo: ['abc', 'dEf', 'GhI', 'ABC', 'abc'],
      bar: { bell: ['abc', 'dEf', 'GhI', 'DEF', 'def'] },
      baz: { qux: ['abc', 'dEf', 'GhI', 'GHI', 'ghi'] },
    });
  });
  it('should transform $alt', function () {
    const schema = {
      foo: {
        $alt: [
          { $value: null },
          { $transform: 'returnUndefined' },
          'foo',
          'bar.bell',
          'baz.qux',
        ],
      },
      'bar.bell': {
        $alt: [
          { $value: null },
          { $transform: 'returnUndefined' },
          'foo',
          'bar.bell',
          'baz.qux',
        ],
      },
      baz: {
        qux: {
          $alt: [
            { $value: null },
            { $transform: 'returnUndefined' },
            'foo',
            'bar.bell',
            'baz.qux',
          ],
        },
      },
    };
    const adapter = new JsonAdapter(schema, {
      returnUndefined: () => undefined,
    });
    const result = adapter.mapTransform({
      foo: undefined,
      bar: {
        bell: undefined,
      },
      baz: {
        qux: 'yay!',
      },
    });
    expect(result).toEqual({
      foo: 'yay!',
      bar: {
        bell: 'yay!',
      },
      baz: {
        qux: 'yay!',
      },
    });
  });
  it('should not pass keys when $filter is false', function () {
    const schema = {
      foo: {
        $filter: 'returnFalse',
      },
      'bar.bell': {
        $filter: 'returnFalse',
      },
      baz: {
        qux: {
          $filter: 'returnFalse',
        },
      },
    };
    const adapter = new JsonAdapter(
      schema,
      {},
      {
        returnFalse: () => false,
      },
    );
    const result = adapter.mapTransform({
      foo: 'abc',
      bar: {
        bell: 'def',
      },
      baz: {
        qux: 'ghi',
      },
    });
    expect(result).toEqual({ baz: {} });
  });
  it('test $lookup', function () {
    const schema = {
      gender1: { $lookup: 'gender' },
      gender2: { $lookup: 'gender' },
      Area: {
        Country: [
          'Area.Country',
          {
            $lookup: 'country',
          },
        ],
      },
    };
    const adapter = new JsonAdapter(
      schema,
      {},
      {},
      {
        gender: [
          ['Male', 'M'],
          ['Female', 'F'],
        ],
        country: [
          ['Pakistan', 'PK'],
          ['USA', 'US'],
        ],
      },
    );
    const result = adapter.mapTransform({
      gender1: 'Male',
      gender2: 'Female',
      Area: {
        Country: 'USA',
      },
    });
    expect(result).toEqual({
      gender1: 'M',
      gender2: 'F',
      Area: {
        Country: 'US',
      },
    });
  });
  it('test $iterate', function () {
    const schema = {
      foo: 'bar',
      baz: {
        $iterate: 'baz',
        qux: 'quux',
        tux: 'pack',
      },
    };
    const adapter = new JsonAdapter(schema);
    const result = adapter.mapTransform({
      bar: 1,
      baz: [
        { quux: 2, pack: 3 },
        { quux: 4, pack: 5 },
      ],
    });
    expect(result).toEqual({
      foo: 1,
      baz: [
        {
          qux: 2,
          tux: 3,
        },
        {
          qux: 4,
          tux: 5,
        },
      ],
    });
  });
});

describe('JsonAdapter - mapTransform error cases', () => {
  const mockTransformers = {};
  const mockFilters = {};
  const mockDictionaries = {};
  const mockVars = {};

  it('should throw an error if object schema is invalid (neither object nor array)', () => {
    const invalidSchema = 'invalid-schema' as unknown;

    expect(
      () =>
        new JsonAdapter(
          // @ts-expect-error TS2345
          invalidSchema,
          mockTransformers,
          mockFilters,
          mockDictionaries,
          mockVars,
        ),
    ).toThrow(/Invalid schema! Expected object or array schema/);
  });

  it('should throw an error if array schema is invalid (neither object nor array)', () => {
    const invalidSchema = [{ key: 'value' }, 'invalid-schema'] as unknown;

    expect(
      () =>
        new JsonAdapter(
          // @ts-expect-error TS2345
          invalidSchema,
          mockTransformers,
          mockFilters,
          mockDictionaries,
          mockVars,
        ),
    ).toThrow(/Invalid schema! Expected object schema/);
  });

  it('should throw an error when schema contains unsafe properties (e.g. prototype keys)', () => {
    const unsafeSchema = {
      constructor: () => 'malicious code', // Unsafe schema contains a prototype-related key
    };

    expect(
      () =>
        new JsonAdapter(
          unsafeSchema,
          mockTransformers,
          mockFilters,
          mockDictionaries,
          mockVars,
        ),
    ).toThrow(/Invalid schema! constructor is a reserved property name/);
  });
});
