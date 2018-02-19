/******
 *
 *
 */

'use strict'

const uuidv1 = require('uuid/v1')
const axios = require('axios')

const UUID = uuidv1()

const { taskSchedules, Task, TcpTask, PingTask } = require('./checkhost-tasks.js')

// host to check:
const HOST = process.env.HOST || 'google.com.ua'

// type of the check (now only 'ping' and 'tcp' supported):
const TYPE = process.env.TYPE === 'tcp' ? 'tcp' : 'ping'

const NODES = process.env.NODES && process.env.NODES.split(',') || []

console.log(NODES)

// should be URI to post data:
const COLLECTOR = process.env.COLLECTOR

var task

const options = {
    schedule: taskSchedules.day,
    nodeslist: NODES
}

if ( TYPE === 'tcp' ) {
    task = new TcpTask(HOST, options)
} else {
    task = new PingTask(HOST, options)
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
    },
    nodeslist: NODES
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

    if ( COLLECTOR ) {
        axios.post(COLLECTOR, {
            uuid: UUID,
            host: HOST,
            type: TYPE,
            data: res,
            stats: stats
        })
        .then(resp => {
            // console.log('Sent to collector successfuly')
        })
        .catch(err => {
            console.log(`Error sending data to collector, got "${err.message}"`)
        })
    }
})
.on('error', err => {
    console.log(err)
})


task.run()

module.exports = () => {
    return {
        uuid: UUID,
        host: HOST,
        type: TYPE,
        started: task.starttime,
        stats: stats,
        lastat: lastat
    }
}

