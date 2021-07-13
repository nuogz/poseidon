const FS = require('fs');
const PA = require('path');

// 深度冻结对象
const deepFreeze = function(object) {
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
// 针对Object的递归相对路径绝对化
const recurParsePathObject = function(object, dir) {
	const objectParsed = {};

	Object.entries(object).forEach(([key, value]) => {
		if(typeof value == 'string') {
			objectParsed[key] = PA.resolve(dir, value);
		}
		else if(value && typeof value == 'object') {
			objectParsed[key] = recurParsePathObject(value, dir);
		}
		else {
			objectParsed[key] = value;
		}
	});

	return objectParsed;
};
// 递归相对路径绝对化
const recurParsePath = function(object, dir) {
	Object.entries(object).forEach(([key, value]) => {
		if(key.startsWith('_')) {
			const keyParsed = key.replace(/^_/, '');

			if(typeof value == 'string') {
				object[keyParsed] = PA.resolve(dir, value);
			}
			// key带有下划线前缀的对象，默认所有子值（包括递归的）都是路径，且子值的key不需要下划线前缀
			else if(value && typeof value == 'object') {
				object[keyParsed] = recurParsePathObject(value, dir);
			}
		}
		else if(value && typeof value == 'object') {
			recurParsePath(value, dir);
		}
	});

	return object;
};


/** 读取配置文件，不做任何处理
 * @param {string} type_ 配置类型
 * - 默认为`''`
 * - 留空或使用`_`为默认配置
 * @param {boolean} [isParse = true] 是否解析数据
 * - 默认为`true`
 * - `true`，返回使用`JSON.parse`解析的数据
 * - `false`，返回`Buffer`
 * @returns {any|Buffer} 无处理的配置数据或Buffer
 */
const readConfig = function(type_, isParse = true) {
	let typeParsed;
	if(typeof type_ == 'string') {
		typeParsed = type_.trim();
	}
	else {
		throw TypeError(`参数[dir]类型必须是string。当前值：${typeof type_}，${type_}`);
	}

	const typeFile = (typeParsed && typeParsed != '_') ? `.${typeParsed}` : '';

	const textConfig = FS.readFileSync(PA.resolve(this.__dir, `config${typeFile}.json`));

	return isParse ? JSON.parse(textConfig) : textConfig;
};
/** 手动加载配置到`Config`。配置会被冻结且进行路径绝对化，重复执行可覆盖现有配置
 * @param {string} type_ 配置类型
 * - 默认为`''`
 * - 留空或使用`_`为默认配置
 * @returns {any} 对应配置类型的配置数据
 */
const loadConfig = function(type_, isSafe) {
	let typeParsed;
	if(typeof type_ == 'string') {
		typeParsed = type_.trim();
	}
	else {
		throw TypeError(`参数[dir]类型必须是string。当前值：${typeof type_}，${type_}`);
	}

	try {
		const raw = this.__raws[typeParsed || '_'] = this.read(typeParsed, false);
		const config = this.__configs[typeParsed || '_'] = JSON.parse(raw);

		return deepFreeze(recurParsePath(config, this.__dir));
	}
	catch(error) {
		if(isSafe) { return undefined; }

		throw error;
	}
};
/** 保存`配置文件`
 * @param {string} type_ 配置类型
 * 默认为`''`
 * 留空或使用`_`为默认配置
 * @param {any} config 需要保存的配置
 * - 可以是任意`FS.writeFile`支持的数据类型
 * @param {boolean} [isBackup = false] 是否备份配置
 * - 默认为`false`
 * @param {string} [pathBackup = this.__dir] 备份配置的位置
 * - 默认为`Config.__dir`，`配置文件`的同一文件夹
 */
const saveConfig = function(type_, config, isBackup = false, pathBackup = this.__dir) {
	let typeParsed;
	if(typeof type_ == 'string') {
		typeParsed = type_.trim();
	}
	else {
		throw TypeError(`参数[dir]类型必须是string。当前值：${typeof type_}，${type_}`);
	}

	const typeFile = (typeParsed && typeParsed != '_') ? `.${typeParsed}` : '';

	if(isBackup) {
		const textConfigBackup = this.read(typeParsed, false);

		const regexNameBackup = new RegExp(`^config${typeFile.replace('.', '\\.')}\\.(\\d)\\.backup\\.json$`);
		const idsFile = FS.readdirSync(pathBackup)
			.map(name => (name.match(regexNameBackup) || [])[1]).filter(n => n);

		FS.writeFileSync(PA.resolve(pathBackup, `config${typeFile}.${Math.max(0, ...idsFile) + 1}.backup.json`), textConfigBackup);
	}

	FS.writeFileSync(PA.resolve(this.__dir, `config${typeFile}.json`), JSON.stringify(config, null, '\t'));

	return this;
};

/**
 * #### 支持分类的只读配置系统，提供读写功能
 * @version 3.1.1-2021.07.13.02
 * @class
 */
const Poseidon = class Poseidon {
	/**
	 * @param {string|Array<string>} [types_ = ''] 初始化时读取的配置
	 * - 默认为`''`
	 * - 多个配置用`,`分割
	 * - 留空或使用`_`为默认配置，即`config.json`。可在多配置留空，如`',server'`
	 * @param {string} dir_ 配置文件夹所在的路径
	 * - 默认为`PA.parse(require.main.filename).dir`
	 * - 初始读取的配置
	 * @returns {Proxy} 配置系统实例
	 */
	constructor(types_ = '', dir_) {
		let types;
		if(typeof types_ == 'string') {
			if(!types_) {
				types = ['_'];
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
			dir = PA.parse(require.main.filename).dir;
		}
		else {
			throw TypeError(`参数[dir]类型必须是string或null或undefined。当前值：${typeof dir_}，${dir_}`);
		}

		const keys = ['load', 'read', 'save'];

		const config = new Proxy(
			{
				__dir: dir,
				__raws: {},
				__configs: {},

				load: loadConfig,
				read: readConfig,
				save: saveConfig,
			},
			{
				get: (self, key) => {
					if(key.startsWith('__') || keys.includes(key)) {
						return self[key];
					}

					if(self.__configs._ && key in self.__configs._) {
						return self.__configs._[key];
					}
					else if(key in self.__configs) {
						return self.__configs[key];
					}
					else {
						return self.load(key, true);
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

		types.forEach(type => config.load(type));

		return config;
	}
};

module.exports = Poseidon;