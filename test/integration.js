const path = require('path');
const { tests } = require('@iobroker/testing');

// Keep the integration environment reproducible. The testing package otherwise
// installs the moving "dev" tag and may run a new controller against stale data.
tests.integration(path.join(__dirname, '..'), {
    controllerVersion: '7.2.2',
});
