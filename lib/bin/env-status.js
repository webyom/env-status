#!/usr/bin/env node
"use strict";

const fs = require('fs'),
      path = require('path'),
      Promise = require('bluebird'),
      mkdirp = require('mkdirp'),
      moment = require('moment'),
      chalk = require('chalk'),
      ora = require('ora'),
      asTable = require('as-table'),
      envStatus = require('../index');

const config = envStatus.getConfig();
const requestEnv = process.argv[2];

if (requestEnv == '--init') {
  if (config) {
    console.log(chalk.yellow('.envstatus.js file already exists!'));
  } else {
    const configPath = path.resolve(__dirname, '../../.envstatus.js');
    fs.writeFileSync(path.resolve('.envstatus2.js'), fs.readFileSync(configPath));
    console.log(chalk.green('.envstatus.js file created!'));
  }

  process.exit();
}

if (requestEnv == '--gen') {
  const pkgInfo = require(path.resolve('package.json'));

  const data = envStatus.getLastCommit();
  data.version = pkgInfo.version;
  const outputPath = path.resolve(config && config.gen || 'dist/env-status.json');
  mkdirp.sync(path.dirname(outputPath));
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  process.exit();
}

const spinner = ora('Loading .envstatus.js').start();

if (!config) {
  spinner.fail(`${chalk.yellow('.envstatus.js')} file is missing!`);
  process.exit();
}

const envs = (config.envs || []).filter(env => {
  if (requestEnv) {
    return typeof env == 'string' && (env == requestEnv || env == 'production');
  } else {
    return typeof env == 'string';
  }
});

if (requestEnv && envs.length < 2) {
  if (!envs.length || envs[0] != requestEnv) {
    spinner.fail(`env ${chalk.yellow(requestEnv)} undefined!`);
    process.exit();
  }
}

const currentVersion = (() => {
  try {
    const pkgInfo = require(path.resolve('package.json'));

    return pkgInfo.version;
  } catch (err) {// do nothing
  }
})();

spinner.text = 'Loading envs data';
Promise.all(envs.map(env => envStatus.fetchEnvData(env))).then(async envsData => {
  if (envsData.length) {
    spinner.clear();
    envsData = envsData.sort((a, b) => {
      return getEnvWeight(a.env) - getEnvWeight(b.env) + (a.date > b.date ? -1 : a.date < b.date ? 1 : 0);
    });
    envsData = await Promise.all(envsData.map(async data => {
      let status;

      if (data.err) {
        status = chalk.red(data.err);
      } else if (data.env == 'production') {
        status = '';
      } else if (await envStatus.isEnvAvailable(data.env)) {
        status = chalk.green('Available');
      } else {
        status = chalk.yellow('Using' + (currentVersion == data.version ? ' *' : ''));
      }

      const res = {
        env: data.env,
        status: status,
        version: data.version,
        branch: data.branch,
        commit: data.commit,
        author: data.author,
        date: data.date && moment(data.date).format('MM/DD HH:mm:ss'),
        since: data.date && moment(data.date).fromNow()
      };
      return res;
    }));
    console.log('');
    console.log(asTable(envsData));
    console.log('');
  } else {
    spinner.fail('No env defined');
  }
}).catch(err => {
  spinner.clear();
  console.error(err);
}).finally(() => spinner.stop());

function getEnvWeight(env) {
  if (env == 'production') {
    return 10;
  } else if (env == 'staging') {
    return 20;
  } else {
    return 30;
  }
}