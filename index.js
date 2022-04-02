import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';


import EscapeStringRegexp from 'escape-string-regexp';


/** 深度冻结对象 */
const deepFreeze = object => {
	// 在冻结自身之前冻结属性
	Object.getOwnPropertyNames(object)
		.forEach(name => {
			const prop = object[name];

			if(typeof prop == 'object' && prop !== null) {
				deepFreeze(prop);
			}
		});

	return Object.freeze(object);
};

/** 针对Object的递归相对路径绝对化 */
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

/** 递归相对路径绝对化 */
const absolutizePath = (config, dir) => {
	Object.entries(config).forEach(([key, value]) => {
		if(key.startsWith('_')) {
			const keyParsed = key.replace(/^_/, '');

			if(typeof value == 'string') {
				config[keyParsed] = resolve(dir, value);
			}
			// 若值是对象，且key以下划线作为前缀，则该对象所有子值（包括递归的）均视为路径
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

/** 配置类型信息 */
class TypeInfo {
	/**
	 * 解析指定配置类型的参数
	 * @param {string} type
	 * @param {boolean} [isParseHidden = true]
	 * @returns {TypeInfo} 配置类型信息
	 */
	static parse(type, isParseHidden = true) {
		if(type instanceof TypeInfo) { return type; }


		let slot;

		if(typeof type != 'string' || !(slot = type.trim())) {
			throw TypeError(`参数~[type]类型必须是非空的string。当前类型~[${typeof type}] (~{${type}})`);
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
	 * 配置类型名称
	 * @type {string}
	 */
	slot;
	/**
	 * 隐藏配置符号（如果配置是隐藏的话）
	 * @type {string}
	 */
	symbolHidden;
	/**
	 * 指示该类型是否默认配置
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
 * 配置类型
 * @typedef {string} Type
 */


/**
 * #### 配置系统（波塞冬）
 * - 已加载的配置均为只读，无法直接修改配置
 * - 以JSON文件作为一个配置单位，支持读取同一目录下的分类存放。默认配置`config.json`，分类配置`config.*.json`
 * - 默认配置没有分类，`_`为默认配置的保留配置名
 * - `'$'`同样也是保留类型，用于返回Poseidon实例
 * - 支持以整个配置为单位的热修改功能
 * @class
 * @version 6.1.1-2022.04.02.01
 */
class Poseidon {
	static TypeInfo = TypeInfo;


	/**
	 * 实例自身
	 * @type {Poseidon}
	 */
	$ = this;

	/**
	 * 配置文件名前缀
	 * @type {string}
	 */
	prefixFile = 'config';



	/**
	 * 配置文件夹所在的路径
	 * @type {string}
	 */
	dirConfig;

	/**
	 * 已加载配置的原始buffer数据
	 * @type {Object.<Type, Buffer>}
	 */
	buffers = {};

	/**
	 * 已加载的JSON配置
	 * @type {Object.<Type, any>}
	 */
	configs = {};



	/**
	 * 读取一个配置文件的原始数据，不做任何处理或仅`JSON.parse`
	 * @param {Type|TypeInfo} type 配置类型
	 * @param {boolean} [willParseJSON = true] `false`，是否解析为JSON数据
	 * @returns {any|Buffer} 原始的JSON数据或buffer
	 */
	read(type, willParseJSON = true) {
		const { slot, symbolHidden, isDefault } = TypeInfo.parse(type);


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
	 * 加载一个配置文件。配置的所有值（递归的）会被冻结，且其中的文件路径值会被转换为绝对路径。可重复加载
	 * @param {Type|TypeInfo} type 配置类型
	 * @param {boolean} [isSafeLoad = false] 加载错误时是否抛出异常
	 * @returns {any} 对应配置类型的配置数据
	 */
	load(type, isSafeLoad = false) {
		const { slot } = TypeInfo.parse(type);


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
	 * 保存一个配置文件，支持保存前备份文件
	 * @param {Type|TypeInfo} type 配置类型
	 * @param {any} config 需要保存的配置，任意`fs.writeFile`支持的类型
	 * @param {boolean} [willBackup = false] `false`，是否备份配置
	 * @param {string} [dirBackup = this.dirConfig] 备份配置的位置
	 * @returns {Poseidon} 该配置系统实例
	 */
	save(type, config, willBackup = false, dirBackup = this.dirConfig) {
		const { slot, symbolHidden, isDefault } = TypeInfo.parse(type);

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
	 * 用于应用修改的回调参数
	 * @callback CallbackEdit
	 * @param {any} configLoaded 对应的原始配置
	 * @param {TypeInfo} typeConfig 配置类型
	 * @param {Poseidon} self 该配置系统实例
	 */
	/** 修改并保存配置，然后重新加载到`Config`
	 * @param {Type|TypeInfo} type 配置类型
	 * @param {CallbackEdit} callbackEdit 配置类型，支持Promise异步
	 * @returns {Poseidon} 该配置系统实例
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
	 * 获得可用的
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
	 * @param {string} [dirConfig = process.cwd()] 配置文件夹所在的路径。默认为`process.cwd()`
	 * @param {string|Array.<Type|TypeInfo>} [types = ''] 预加载的配置。`,`分割。`_`默认配置
	 * @returns {Poseidon} 该配置系统实例的`代理`
	 */
	constructor(dirConfig = process.cwd(), types = '') {
		if(typeof types != 'string' && !(types instanceof Array)) {
			throw TypeError(`参数[types]类型必须是string或Array。当前类型~[${typeof types}] (~{${types}})`);
		}

		if(typeof dirConfig != 'string') {
			throw TypeError(`参数[dirConfig]类型必须是string。当前类型~[${typeof dirConfig}] (~{${dirConfig}})`);
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
						throw Error(`不允许修改内存中的配置。键：${key}，当前值：${typeof value}，${value}`);
					}
				}
			}
		);

		types.split(',').filter(type => type).forEach(type => this.load(type));

		return this.proxy;
	}
}


export default Poseidon;
