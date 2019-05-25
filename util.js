const fs = require('fs');
const path = require('path');
const subdir = require('subdir');
const util = require('util');
const vscode = require('vscode');

const rootPath = vscode.workspace.rootPath;

let VS_CONTEXT = null;

/**
 * Custom Await Method for Processing Hidden File Config
 */
var _await = (this && this._await) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator['throw'](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};

/**
 * Delete Key from Exclude Config
 * @param {string} key
 * @param {string} uri
 * @param {function} callback
 */
function deleteExclude(key, uri, callback) {
    if (!key) {
        return false;
    }

    const config = vscode.workspace.getConfiguration('files', null);

    let excludes = config.get('exclude');
    if (!excludes) {
        excludes = {};
    }

    // Remove if already set
    if (key && excludes.hasOwnProperty(key)) {
        delete excludes[key];
        updateConfig(excludes, uri, callback, `Removed ${key} from Hidden Items`)
    }
}

/**
 * Get Excluded Fils
 */
function getExcludes() {
    if (!rootPath || rootPath === '') {
        return [];
    }

    const config = vscode.workspace.getConfiguration('files', null);
    const excludes = config.get('exclude');

    let list =  excludes ? Object.keys(config.get('exclude')) : [];

    for (let i = 0; i < list.length; i++) {
        let enabled = (excludes[list[i]]) ? 1 : 0;
        list[i] = `${list[i]}|${enabled}`
    }

    return list;
}

/**
 * Get Image Path
 * @param {string} file
 */
function getImagePath(file) {
    return VS_CONTEXT.asAbsolutePath(path.join('resources', file));
}

/**
 * Get Root Workspace Directory
 * @param {string} uri
 */
function getRoot(uri) {
    if (isMultiRoot()) {
        let matchRoot = vscode.workspace.workspaceFolders.filter((wf) => {
            return isParentPath(uri.fsPath, wf.uri.fsPath);
        }).map(v => v.uri.fsPath);

        return matchRoot[0];
    }
    else {
        return rootPath || '';
    }
}

/**
 * Check if Path Exists
 * @param {string} _path
 */
function ifExists(_path) {
    if (isUnavailable(_path)) {
        return Promise.reject(new Error(`${_path} should has a falsy value`));
    }
    return new Promise((res, rej) => {
        fs.access(_path, (error) => {
            if (util.isNullOrUndefined(error)) {
                res(true);
            }
            else {
                rej(error);
            }
        });
    });
}

/**
 * Check if this is a Multi Root Workspace
 */
function isMultiRoot() {
    if (vscode.workspace.workspaceFolders) {
        return vscode.workspace.workspaceFolders.length > 1;
    }
    return false;
}

/**
 * Check if Path is a Parent Directory
 * @param {string} source
 * @param {integer} target
 */
function isParentPath(source, target) {
    return target !== '/' && subdir(target, source);
}

/**
 * Check if path is defined
 * @param {string} _path
 */
function isUnavailable(_path) {
    return util.isNullOrUndefined(_path) || _path === '';
}

/**
 * Parse File Path
 * @param {string} _file
 * @param {string} rootPath
 */
function parseFilePath(_file, _root = '') {
    return _await(this, void 0, void 0, function* () {
        if (isUnavailable(_file)) {
            return Promise.reject(new Error(`${_file} is not available`));
        }

        try {
            yield ifExists(_file);

            const ext = path.extname(_file);
            const base = path.basename(_file);
            const dir = path.relative(_root, path.dirname(_file));

            return {
                path: _file,
                ext,
                base,
                dir
            };
        }
        catch (error) {
            return Promise.reject(error);
        }
    });
}

/**
 * Save VS Code Context for Pane Reference
 * @param {object} context
 */
function saveContext(context) {
    VS_CONTEXT = context;
}

/**
 * Show Item Select Menu
 * @param {array} items
 */
function showPicker(items) {
    return vscode.window.showQuickPick(items, {
        placeHolder: 'What would you like to hide? Select all that apply.',
        canPickMany: true
    });
}

/**
 * Toggle Visibility of Excluded Pattern
 * @param {string} key
 * @param {function} callback
 */
function toggleExclude(key, callback) {
    if (!key) {
        return false;
    }

    const config = vscode.workspace.getConfiguration('files', null);

    let excludes = config.get('exclude');
    if (!excludes) {
        excludes = {};
    }

    // Invert Selection
    if (key && excludes.hasOwnProperty(key)) {
        excludes[key] = !(excludes[key]);
        updateConfig(excludes, key, callback);
    }
}

/**
 * Write Exclude Updates to Config File
 * @param {object} excludes
 * @param {string} uri
 * @param {function} callback
 * @param {string} message
 */
function updateConfig(excludes, uri, callback, message) {
    if (!rootPath || rootPath === '') {
        return;
    }

    try {
        const config = vscode.workspace.getConfiguration('files', null);

        let target = vscode.ConfigurationTarget.Workspace || null;

        if (isMultiRoot()) {
            const multiConfig = vscode.workspace.getConfiguration('explorerExclude', uri);
            let isExcludeFolder = multiConfig.get('folder');
            target = isExcludeFolder ? vscode.ConfigurationTarget.WorkspaceFolder : vscode.ConfigurationTarget.Workspace;
        }

        config.update('exclude', excludes, target).then(() => {
            if (message) {
                vscode.window.showInformationMessage(message);
            }

            if (typeof callback === 'function') {
                callback();
            }
        });
    }
    catch (error) {
        vscode.window.showErrorMessage(error.message || error);
    }
}

/**
 * VS Code Action - Handle Mapping URI Exclusion to possible Regex Pattern Matches
 * @param {string} uri
 * @param {function} callback
 */
function vscExclude(uri, callback) {
    return _await(this, void 0, void 0, function* () {
        try {
            const _path = uri.fsPath;
            const _root = getRoot(uri) || '';
            const _meta = (yield parseFilePath(_path, _root));

            let selections;
            let options = [];

            Object.keys(_meta).forEach(key => {
                let regex = undefined;
                switch (key) {
                    case 'path':
                        break;
                    case 'ext':
                        regex = _meta[key] ? `**/*${_meta[key]}` : undefined;
                        break;
                    case 'base':
                        regex = _meta[key];
                        break;
                    case 'dir':
                        regex = _meta[key] ? `${_meta[key] + '/'}*.*` : undefined;
                        break;
                }
                if (regex) {
                    options.push(regex);
                }
            });

            if (_meta['dir'] && _meta['ext']) {
                options.push(`${_meta['dir']}/*${_meta['ext']}`);
            }
            else if (_meta['ext']) {
                options.push(`*${_meta['ext']}`);
            }

            if (_meta['base']) {
                options.push(`**/${_meta['base']}`);
                if (_meta['dir']) {
                    options.push(`${_meta['dir']}/${_meta['base']}`);
                }
            }

            selections = yield showPicker(options.reverse());

            if (selections && selections.length > 0) {
                const config = vscode.workspace.getConfiguration('files', null);

                let excludes = config.get('exclude');
                if (!excludes) {
                    excludes = {};
                }

                try {
                    Array.from(new Set(selections)).filter(v => v !== '*').forEach((rule) => { excludes[rule] = true; });
                    updateConfig(excludes, uri, callback);
                }
                catch (error) {
                    vscode.window.showErrorMessage(error.message || error);
                }
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(error.message || error);
        }
    });
}

/**
 * VS Code Action - Remove item from Excluded Patterns
 * @param {*} item
 * @param {*} callback
 */
function vscRemove (item, callback) {
    if (item && item.value) {
        const value = item.value;
        const title = value.substring(0, value.length - 2);
        deleteExclude(title, null, callback);
    }
}

/**
 * VS Code Action - Tiggle Visibility of item from Excluded Patterns
 * @param {*} key
 * @param {*} callback
 */
function vscToggle (key, callback) {
    if (key) {
        toggleExclude(key, callback);
    }
}

module.exports = {
    getExcludes,
    getImagePath,
    saveContext,
    vscExclude,
    vscRemove,
    vscToggle
}
