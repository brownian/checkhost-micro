/******
 *
 *
 */

'use strict'

const { taskSchedules, Task, TcpTask, PingTask } = require('./checkhost-tasks.js')

const HOST = process.env.HOST || 'volz.ua'
const TYPE = process.env.TYPE === 'tcp' ? 'tcp' : 'ping'

var task

if ( TYPE === 'tcp' ) {
    task = new TcpTask(HOST, taskSchedules.day, false)
} else {
    task = new PingTask(HOST, taskSchedules.day, false)
}

//task.on('response', resp => {
//    console.log(resp)
//})

const stats = {
    nodes: 0,
    probes: 0,
    failed: 0,
    failedpercents: 0,
    times: {
        min: false,
        max: false,
        sum: false,
        sumsq: false,
        mean: false,
        rms: false,
        stddev: false,
    }
}

var lastat

task.on('result', res => {
    const result = task.parseResult(res.response)

    stats.nodes += result.nodes
    stats.probes += result.probes
    stats.failed += result.failed

    stats.failedpercents = stats.failed * 100 / stats.probes

    const times = result.times.slice(0)

    times.push(stats.times.min)
    times.push(stats.times.max)
    stats.times.min = Math.min(...times.filter(v=>v))
    stats.times.max = Math.max(...times.filter(v=>v))

    stats.times.sum   += result.times.filter(v=>v).reduce((a,b) => a+b, 0)
    stats.times.sumsq += result.times.filter(v=>v).reduce((a,b) => a + b*b, 0)

    stats.times.mean = stats.times.sum / stats.nodes
    stats.times.rms  = Math.sqrt(stats.times.sumsq / stats.nodes)

    stats.times.stddev = Math.sqrt(stats.times.sumsq / stats.nodes - (stats.times.mean)**2)

    lastat = result.datetime

})
.on('error', err => {
    console.log(err)
})


task.run()

module.exports = (request, response) => {
    return {
        host: HOST,
        type: TYPE,
        started: task.starttime,
        stats: stats,
        lastat: lastat
    }
}

