/** @typedef {any} ConfigRaw */
/** @typedef {any} ConfigFreezed */
export class Poseidon {
    static ConfigType: typeof ConfigType;
    /**
     * @param {string} [dirConfig = process.cwd()] dir of configs. `process.cwd()` is default.
     * @param {string|Array.<ConfigTypeRaw|ConfigType>} [types = ''] types for preloading. splited by `,`. `_` is default.
     */
    constructor(dirConfig?: string, types?: string | Array<ConfigTypeRaw | ConfigType>);
    /**
     * instance
     * @type {Poseidon}
     */
    $: Poseidon;
    /**
     * the prefix of config file
     * @type {string}
     */
    prefixFile: string;
    /**
     * dir of configs
     * @type {string}
     */
    dirConfig: string;
    /**
     * loaded file buffer data
     * @type {Object.<string, Buffer>}
     */
    buffers: {
        [x: string]: Buffer;
    };
    /**
     * loaded JSON data
     * @type {Object.<string, ConfigRaw>}
     */
    configs: {
        [x: string]: ConfigRaw;
    };
    /** @type {PoseidonProxy} */
    proxy: PoseidonProxy;
    /**
     * read the raw data of a config file, without any processing or only `JSON.parse`
     * @param {ConfigTypeRaw|ConfigType} type
     * @param {boolean} [willParseJSON = true] `false`，detect to parse as JSON
     * @returns {ConfigRaw|Buffer} raw JSON data or buffer
     */
    read(type: ConfigTypeRaw | ConfigType, willParseJSON?: boolean): ConfigRaw | Buffer;
    /**
     * load a config file. the config (recursive) will be fronzen
     * all marked file path values are converted to absolute paths
     * reloading is repeatable
     * @param {ConfigTypeRaw|ConfigType} type
     * @param {boolean} [isSafeLoad = false] detect throw error
     * @returns {ConfigFreezed}
     */
    load(type: ConfigTypeRaw | ConfigType, isSafeLoad?: boolean): ConfigFreezed;
    /**
     * save a config to file. support backup config file before saving
     * @param {ConfigTypeRaw|ConfigType} type
     * @param {ConfigRaw} config the config which data type supported by 'fs.writeFile'
     * @param {boolean} [willBackup = false] `false`，detect backup
     * @param {string} [dirBackup = this.dirConfig] dir of config backup
     * @returns {Poseidon}
     */
    save(type: ConfigTypeRaw | ConfigType, config: ConfigRaw, willBackup?: boolean, dirBackup?: string): Poseidon;
    /**
     * @callback CallbackEdit
     * @param {ConfigRaw} configLoaded raw config
     * @param {ConfigType} typeConfig
     * @param {Poseidon} self
     * @returns {ConfigRaw}
     */
    /** modify, save and reaload a config
     * @param {ConfigTypeRaw|ConfigType} type
     * @param {CallbackEdit} callbackEdit support Promise
     * @returns {Poseidon}
     */
    edit(type: ConfigTypeRaw | ConfigType, callbackEdit: (configLoaded: ConfigRaw, typeConfig: ConfigType, self: Poseidon) => ConfigRaw): Poseidon;
    /**
     * get available types
     * @returns {Array.<ConfigTypeRaw>}
     */
    getTypesExist(): Array<ConfigTypeRaw>;
}
/**
 * - all loaded configs are read-only and cannot be modified directly
 * - one JSON file as a configuration unit
 * - all configs storage in the same directory.
 * - default config is `config.json'. classified config is `config.*.json`
 * - `_` is the reserved slot of the default config
 * - `$` is the reserved slot too. it used to access Poseidon Object
 * - supports hot modification in file units
 */
export default class PoseidonProxy {
    /**
     * @param {string} [dirConfig = process.cwd()] dir of configs. `process.cwd()` is default.
     * @param {string|Array.<ConfigTypeRaw|ConfigType>} [types = ''] types for preloading. splited by `,`. `_` is default.
     */
    constructor(dirConfig?: string, types?: string | Array<ConfigTypeRaw | ConfigType>);
    /** @type {Poseidon} */
    $: Poseidon;
}
export type ConfigTypeRaw = string;
export type ConfigRaw = any;
export type ConfigFreezed = any;
/** @typedef {string} ConfigTypeRaw */
declare class ConfigType {
    /**
     * @param {string} type
     * @param {boolean} [willParseHidden = true]
     * @returns {ConfigType}
     */
    static parse(type: string, willParseHidden?: boolean): ConfigType;
    /**
     * @param {string} slot
     * @param {string} symbolHidden
     * @param {boolean} isDefault
     */
    constructor(slot: string, symbolHidden: string, isDefault: boolean);
    /**
     * config's slot
     * @type {string}
     */
    slot: string;
    /**
     * the symbol of hidden config
     * @type {string}
     */
    symbolHidden: string;
    /**
     * detect config is default config
     * @type {boolean}
     */
    isDefault: boolean;
}
export {};
