const Module = require('module');
const { workerData } = require('worker_threads');

const originalLoad = Module._load;
Module._load = function blockElectron(request, parent, isMain) {
  if (request === 'electron') {
    const error = new Error("Cannot find module 'electron'");
    error.code = 'MODULE_NOT_FOUND';
    throw error;
  }
  return originalLoad.call(this, request, parent, isMain);
};

require(workerData.targetModule);
