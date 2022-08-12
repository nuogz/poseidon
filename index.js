import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

import EscapeStringRegexp from 'escape-string-regexp';

import { T, TT } from './lib/i18n.js';



const deepFreeze = object => {
	// freeze properties before freeze self
	Object.getOwnPropertyNames(object)
		.forEach(name => {
			const prop = object[name];

			if(typeof prop == 'object' && prop !== null) {
				deepFreeze(prop);
			}
		});

	return Object.freeze(object);
};

const absolutizePathObject = (object, dir) => {
	const objectParsed = {};

	Object.entries(object).forEach(([key, value]) => {
		if(typeof value == 'string') {
			objectParsed[key] = resolve(dir, value);
		}
		else if(value && typeof value == 'object') {
			objectParsed[key] = absolutizePathObject(value, dir);
		}
		else {
			objectParsed[key] = value;
		}
	});

	return objectParsed;
};

const absolutizePath = (config, dir) => {
	Object.entries(config).forEach(([key, value]) => {
		if(key.startsWith('_')) {
			const keyParsed = key.replace(/^_/, '');

			if(typeof value == 'string') {
				config[keyParsed] = resolve(dir, value);
			}
			// if the value is an object, and the key is prefixed by `_`, all child values (including recursive) of this value are regarded as paths
			else if(value && typeof value == 'object') {
				config[keyParsed] = absolutizePathObject(value, dir);
			}
		}
		else if(value && typeof value == 'object') {
			absolutizePath(value, dir);
		}
	});

	return config;
};



class TypeInfo {
	/**
	 * @param {string} type
	 * @param {boolean} [isParseHidden = true]
	 * @returns {TypeInfo}
	 */
	static parse(type, isParseHidden = true, locale) {
		if(type instanceof TypeInfo) { return type; }


		let slot;

		if(typeof type != 'string' || !(slot = type.trim())) {
			throw TypeError(T('error.typeType', { type, typeType: typeof type }), locale);
		}


		const isHidden = slot.startsWith('.') && isParseHidden;

		if(isHidden) { slot = slot.replace('.', ''); }


		return new TypeInfo(
			slot,
			isHidden ? '.' : '',
			slot == '_'
		);
	}


	/**
	 * config's slot
	 * @type {string}
	 */
	slot;
	/**
	 * the symbol of hidden config
	 * @type {string}
	 */
	symbolHidden;
	/**
	 * detect config is default config
	 * @type {boolean}
	 */
	isDefault;

	constructor(slot, symbolHidden, isDefault) {
		this.slot = slot;
		this.symbolHidden = symbolHidden;
		this.isDefault = isDefault;
	}
}



/**
 * Config Type
 * @typedef {string} Type
 */


/**
 * - all loaded configs are read-only and cannot be modified directly
 * - one JSON file as a configuration unit
 * - all configs storage in the same directory.
 * - default config is `config.json'. classified config is `config.*.json`
 * - `_` is the reserved slot of the default config
 * - `$` is the reserved slot too. it used to access Poseidon Object
 * - supports hot modification in file units
 * @class
 */
export default class Poseidon {
	static TypeInfo = TypeInfo;


	/**
	 * instance
	 * @type {Poseidon}
	 */
	$ = this;

	/**
	 * the prefix of config file
	 * @type {string}
	 */
	prefixFile = 'config';



	/**
	 * dir of configs
	 * @type {string}
	 */
	dirConfig;

	/**
	 * loaded file buffer data
	 * @type {Object.<Type, Buffer>}
	 */
	buffers = {};

	/**
	 * loaded JSON data
	 * @type {Object.<Type, any>}
	 */
	configs = {};



	/**
	 * logger locale
	 * @type {string}
	 */
	locale;



	/**
	 * read the raw data of a config file, without any processing or only `JSON.parse`
	 * @param {Type|TypeInfo} type
	 * @param {boolean} [willParseJSON = true] `false`，detect to parse as JSON
	 * @returns {any|Buffer} raw JSON data or buffer
	 */
	read(type, willParseJSON = true) {
		const { slot, symbolHidden, isDefault } = TypeInfo.parse(type, true, this.locale);


		const nameFile =
			symbolHidden +
			this.prefixFile +
			(isDefault ? '' : `.${slot}`) +
			'.json';

		const bufferConfig = readFileSync(resolve(this.dirConfig, nameFile));


		return willParseJSON ?
			JSON.parse(bufferConfig) :
			bufferConfig;
	}


	/**
	 * load a config file。the config (recursive) will be fronzen
	 * all marked file path values are converted to absolute paths
	 * reloading is repeatable
	 * @param {Type|TypeInfo} type
	 * @param {boolean} [isSafeLoad = false] detect throw error
	 * @returns {any}
	 */
	load(type, isSafeLoad = false) {
		const { slot } = TypeInfo.parse(type, true, this.locale);


		try {
			const buffer = this.buffers[slot] = this.read(type, false);
			const config = this.configs[slot] = JSON.parse(buffer);


			return config && typeof config == 'object' ?
				deepFreeze(absolutizePath(config, this.dirConfig)) :
				config;
		}
		catch(error) {
			if(isSafeLoad) { return undefined; }

			throw error;
		}
	}


	/**
	 * save a config to file. support backup config file before saving
	 * @param {Type|TypeInfo} type
	 * @param {any} config the config. any data type supported by 'fs.writeFile'
	 * @param {boolean} [willBackup = false] `false`，detect backup
	 * @param {string} [dirBackup = this.dirConfig] dir of config backup
	 * @returns {Poseidon}
	 */
	save(type, config, willBackup = false, dirBackup = this.dirConfig) {
		const { slot, symbolHidden, isDefault } = TypeInfo.parse(type, true, this.locale);

		const nameFile =
			symbolHidden +
			this.prefixFile +
			(isDefault ? '' : `.${slot}`);


		if(willBackup) {
			const regexBackup = new RegExp(`^${EscapeStringRegexp(nameFile)}\\.(\\d+)\\.backup\\.json$`);
			const idsBackup = readdirSync(dirBackup)
				.map(name => (name.match(regexBackup) || [])[1]).filter(n => n);
			const idBackupMax = Math.max(0, ...idsBackup) + 1;

			writeFileSync(
				resolve(dirBackup, `${nameFile}.${idBackupMax}.backup.json`),
				this.read(type, false)
			);
		}


		writeFileSync(resolve(this.dirConfig, `${nameFile}.json`), JSON.stringify(config, null, '\t'));


		return this;
	}


	/**
	 * @callback CallbackEdit
	 * @param {any} configLoaded raw config
	 * @param {TypeInfo} typeConfig
	 * @param {Poseidon} self
	 */
	/** modify, save and reaload a config
	 * @param {Type|TypeInfo} type
	 * @param {CallbackEdit} callbackEdit support Promise
	 * @returns {Poseidon}
	 */
	edit(type, callbackEdit) {
		const config = this.read(type);


		const raw = callbackEdit(config, type, this);

		if(raw instanceof Promise) {
			return raw
				.then(configNew => {
					this.save(type, configNew ?? config);
					this.load(type);


					return this;
				});
		}


		this.save(type, raw ?? config);
		this.load(type);


		return this;
	}


	/**
	 * get available types
	 * @returns {Array.<Type>}
	 */
	getTypesExist() {
		const files = readdirSync(this.dirConfig);


		const regexDefault = new RegExp(`^\\.?${this.prefixFile}\\.json$`);
		const regexConfig = new RegExp(`^\\.?${this.prefixFile}\\.(.*?)\\.json$`);
		const regexBackup = new RegExp(`^\\.?${this.prefixFile}\\..*?\\.(\\d+)\\.backup\\.json$`);


		return files.map(file => {
			const symbolHidden = file.startsWith('.') ? '.' : '';


			if(regexDefault.test(file)) { return `${symbolHidden}_`; }

			if(regexBackup.test(file)) { return; }


			const type = file.match(regexConfig)?.[1];
			return type ? `${symbolHidden}${type}` : undefined;
		}).filter(type => type);
	}



	/**
	 * @param {string} [dirConfig = process.cwd()] dir of configs. `process.cwd()` is default.
	 * @param {string|Array.<Type|TypeInfo>} [types = ''] types for preloading。splited by `,`. `_` is default.
	 * @param {string} [locale]
	 * @returns {Poseidon}
	 */
	constructor(dirConfig = process.cwd(), types = '', locale) {
		this.locale = locale;
		this.TT = TT(this.locale);

		if(typeof types != 'string' && !(types instanceof Array)) {
			throw TypeError(this.TT('error.typesType', { types, type: typeof types }));
		}

		if(typeof dirConfig != 'string') {
			throw TypeError(this.TT('error.dirConfigType', { dirConfig, type: typeof dirConfig }));
		}


		this.dirConfig = dirConfig;


		this.proxy = new Proxy(this,
			{
				get(self, key) {
					if(key == '$') { return self; }

					if(self.configs._ && key in self.configs._) { return self.configs._[key]; }

					if(key in self.configs) { return self.configs[key]; }


					return self.load(key, true);
				},
				set(self, key, value) {
					// would throw error in strict mode
					if((function() { return !this; }())) {
						throw Error(this.TT('error.invalidSet', { key, value, type: typeof value }));
					}
				}
			}
		);

		types.split(',').filter(type => type).forEach(type => this.load(type));

		return this.proxy;
	}
}
