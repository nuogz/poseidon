import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { parse as parsePath, resolve } from 'path';


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

/**
 * 解析指定配置类型的参数
 * @param {string} type
 * @param {boolean} [isParseHidden = true]
 * @returns
 */
const parseType = (type, isParseHidden = true) => {
	if(typeof type != 'string') { throw TypeError(`参数~[type]类型必须是非空的string。当前值：${typeof type}，${type}`); }


	let slot = type.trim();


	const isHidden = slot.startsWith('.') && isParseHidden;

	if(isHidden) { slot = slot.replace('.', ''); }


	return {
		slot,
		symbolHidden: isHidden ? '.' : null,
		isDefault: slot == '_'
	};
};


/**
 * #### 配置系统（波塞冬）
 * - 已加载的配置均为只读，无法直接修改配置
 * - 以JSON文件作为一个配置单位，支持读取同一目录下的分类存放。默认配置`config.json`，分类配置`config.*.json`
 * - 默认配置没有分类，`_`为默认配置的保留配置名
 * - 支持以整个配置为单位的热修改功能
 * @class
 * @version 5.2.0-2022.03.25.02
 */
const Poseidon = class Poseidon {
		/**
	 * 配置文件名前缀
	 * @type {string}
	 */
		 prefixFile = 'config';

		 /**
		  * 配置文件名前缀分隔符
		  * @type {string}
		  */
		 sepPrefix = '.';


	/**
	 * 配置文件夹所在的路径
	 * @type {string}
	 */
	 __dir;

	 /**
	  * 已加载配置的原始数据
	  * @type {Object.<string, Buffer>}
	  */
	 __raws = {};

	 /**
	  * 原始配置
	  * @type {Object.<string, any>}
	  */
	 __configs = {};



	/** 读取配置文件的原始数据，不做任何处理或仅`JSON.parse`
	 * @param {string} type 配置类型
	 * @param {boolean} [willParseJSON = true] `false`，是否解析为JSON数据
	 * @returns {any|Buffer} 原始的JSON数据或buffer
	 */
	 __read(type, willParseJSON = true) {
		const { slot, symbolHidden, isDefault } = parseType(type);


		const nameFile =
			symbolHidden +
			this.prefixFile +
			(isDefault ? `${this.sepPrefix}${slot}` : '') +
			'.json';

		const textConfig = readFileSync(resolve(this.__dir, nameFile));


		return willParseJSON ?
			JSON.parse(textConfig) :
			textConfig;
	}


	/** 加载一个配置单位。配置的所有值（递归的）会被冻结，且其中的文件路径值会被转换为绝对路径。可重复加载
	 * @param {string} [type = ''] `''`，配置类型
	 * @param {boolean} [isSafeLoad = false] 加载错误时是否抛出异常
	 * @returns {any} 对应配置类型的配置数据
	 */
	__load(type, isSafeLoad = false) {
		const { slot } = parseType(type, false);


		try {
			const raw = this.__raws[slot] = this.__read(slot, false);
			const config = this.__configs[slot] = JSON.parse(raw);

			return config && typeof config != 'object' ?
			deepFreeze(absolutizePath(config, this.__dir)) :
			config;
		}
		catch(error) {
			if(isSafeLoad) { return undefined; }

			throw error;
		}
	}


	/** 保存`配置文件`
	 * @param {string} type_ 配置类型
	 * 默认为`''`
	 * 使用`_`为默认配置
	 * @param {any} config 需要保存的配置
	 * - 可以是任意`node.fs.writeFile`支持的数据类型
	 * @param {boolean} [isBackup = false] 是否备份配置
	 * - 默认为`false`
	 * @param {string} [pathBackup = this.__dir] 备份配置的位置
	 * - 默认为`Config.__dir`，`配置文件`的同一文件夹
	 * @returns {Poseidon} 该配置系统实例
	 */
	__save(type_, config, isBackup = false, pathBackup = this.__dir) {
		const { typeParsed, isHide } = parseType(type_);

		const typeFile = (typeParsed && typeParsed != '_') ? `.${typeParsed}` : '';

		if(isBackup) {
			const textConfigBackup = this.__read(typeParsed, false, isHide);

			const regexNameBackup = new RegExp(`^${isHide ? '\\.' : ''}config${typeFile.replace('.', '\\.')}\\.(\\d)\\.backup\\.json$`);
			const idsFile = readdirSync(pathBackup)
				.map(name => (name.match(regexNameBackup) || [])[1]).filter(n => n);

			writeFileSync(resolve(pathBackup, `${isHide ? '.' : ''}config${typeFile}.${Math.max(0, ...idsFile) + 1}.backup.json`), textConfigBackup);
		}

		writeFileSync(resolve(this.__dir, `${isHide ? '.' : ''}config${typeFile}.json`), JSON.stringify(config, null, '\t'));

		return this;
	}


	/**
	 * 用于应用修改的回调参数
	 * @callback callbackEdit
	 * @param {any} configLoaded 对应的原始配置
	 * @param {string} typeConfig 配置类型
	 * @param {Poseidon} self 该配置系统实例
	 */
	/** 修改并保存配置，然后重新加载到`Config`
	 * @param {string} type_ 配置类型
	 * - 默认为`''`
	 * - 留空或使用`_`为默认配置
	 * @param {callbackEdit} functionEdit 配置类型，支持Promise
	 * @returns {Poseidon} 该配置系统实例
	 */
	 __edit(type_, functionEdit) {
		const config = this.__read(type_);

		const raw = functionEdit(config, type_, this);

		if(raw instanceof Promise) {
			return raw.then(configNew => {
				const configFinal = raw === undefined ? config : configNew;

				this.__save(type_, configFinal);
				this.__load(type_);

				return this;
			});
		}
		else {
			const configFinal = raw === undefined ? config : raw;

			this.__save(type_, configFinal);
			this.__load(type_);

			return this;
		}
	}





	/**
	 * @param {string|Array<string>} [types_ = ''] 初始化时读取的配置
	 * - 默认为`''`，不预加载任何配置
	 * - 多个配置用`,`分割
	 * - 使用`_`为默认配置，即`config.json`。可在多配置留空，如`',server'`
	 * @param {string} dir_ 配置文件夹所在的路径
	 * - 默认为`PA.parse(require.main.filename).dir`
	 * - 初始读取的配置
	 * @returns {Poseidon} 该配置系统实例
	 */
	constructor(types_ = '', dir_) {
		let types;
		if(typeof types_ == 'string') {
			if(!types_) {
				types = [];
			}
			else {
				types = types_.split(',');
			}
		}
		else if(types_ instanceof Array) {
			types = types_;
		}
		else {
			throw TypeError(`参数[types]类型必须是string或Array。当前值：${typeof types_}，${types_}`);
		}


		let dir;
		if(dir_ && typeof dir_ == 'string') {
			dir = dir_;
		}
		else if(dir_ === null || dir_ === undefined) {
			dir = parsePath(require.main.filename).dir;
		}
		else {
			throw TypeError(`参数[dir]类型必须是string或null或undefined。当前值：${typeof dir_}，${dir_}`);
		}

		this.__dir = dir;


		const proxyConfig = new Proxy(this,
			{
				get: (self, key) => {
					if(key.startsWith('__')) {
						return self[key];
					}

					if(self.__configs._ && key in self.__configs._) {
						return self.__configs._[key];
					}
					else if(key in self.__configs) {
						return self.__configs[key];
					}
					else {
						return self.__load(key, true);
					}
				},
				set: (self, key, value) => {
					// 严格模式下抛出异常
					if((function() { return !this; }())) {
						throw Error(`不允许修改内存中的配置。键：${key}，当前值：${typeof value}，${value}`);
					}
				}
			}
		);

		types.forEach(type => proxyConfig.__load(type));

		return proxyConfig;
	}
};


export default Poseidon;