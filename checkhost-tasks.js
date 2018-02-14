/******
 *
 * Getting results from check-host.net and parsing them.
 * https://check-host.net/about/api?lang=en
 *
 * Now ony 'ping' and 'tcp' checks supported.
 */

'use strict'

const EventEmitter = require('events')
const axios = require('axios')

const taskSchedules = {
    day: {
        interval: 60,
        retryDelay: 3,
        duration: 3600*24,
    },
    twodays: {
        interval: 120,
        retryDelay: 10,
        duration: 3600*48,
    },
    week: {
        interval: 300,
        retryDelay: 10,
        duration: 3600*24*7,
    }
}

const $timeout = (delay) => {
    return new Promise((resolve, reject) => {
        let id = setTimeout(() => {
            clearTimeout(id)
            resolve(delay)
        }, delay)
    })
}

class Task extends EventEmitter {
    constructor (host, type, schedule, maxNodes, logger) {
        super()
        this.type = type
        this.host = host
        this.maxNodes = maxNodes || 10
        this.url = 'https://check-host.net/check-' + this.type
                    + '?max_nodes=' + this.maxNodes + '&host=' + this.host,
        this.checkResultUrl = 'https://check-host.net/check-result/'
        this.runinterval = schedule.interval * 1000
        this.starttime = false
        this.stoptime = false
        this.retryDelay = schedule.retryDelay * 1000
        this.runIntervalId = false
        this.testIntervalId = false
        this.attempt = 0
        this.maxAttempts = 3

        this.logger = logger || console

        this.once('started', () => {
            this.logger.log('debug', 'Task just has been started.')
            this.starttime = new Date()
        })
        this.once('stopped', () => {
            this.logger.log('debug', 'Stopped')
            this.stoptime = new Date()
        })

        this.on('result', res => {
            this.logger.log('silly', 'Raw result: %s', JSON.stringify(res.response))
            this.logger.log('debug', 'done.')
        })
        this.on('error', err => {
            this.logger.log('error', 'Got error: %s', err)
        })
    }

    parseResult (result) {
        return result
    }

    getResponseData (requestId) {
        return axios({
            method: 'get',
            url: this.checkResultUrl + requestId,
            headers: {'Accept': 'application/json'}
        })
        .then(resp => {
            if ( Object.keys(resp.data).every(k => resp.data[k]) ) {
                this.attempt = 0
                return resp

            } else if ( this.attempt + 1 === this.maxAttempts ) {
                this.logger.log('debug', 'Some nodes are still working, but maxAttempts reached (%s).', this.maxAttempts)
                this.attempt = 0
                return resp

            } else {
                this.logger.log('debug', 'Some nodes are still working.')
                this.attempt += 1
                // delay:
                return $timeout(this.retryDelay)
                    .then(tmout => this.getResponseData(requestId))
            }
        })
        .catch(e => {
            this.emit('error', e)
        })
    }

    runOnce () {
        this.logger.log('debug', 'Run...')
        axios({
            method: 'get',
            url: this.url,
            headers: { 'Accept': 'application/json' }
        })
        .then(resp => {
            if ( ! this.starttime ) {
                this.emit('started')
            }

            if ( resp.data.ok ) {
                this.emit('response', resp.data)

                this.logger.log('debug', 'Request id: %s', resp.data.request_id)

                // delay:
                return $timeout(this.retryDelay)
                    .then(tmout => this.getResponseData(resp.data.request_id))
                    .then(response => {
                        const retData = {
                            request: resp.data,
                            response: response.data
                        }
                        return retData
                    })

            } else if ( resp.data.error ) {
                throw resp.data.error

            } else {
                throw 'Unknown reply format?..'
            }
        })
        .then(result => {
            this.emit('result', result)
        })
        .catch(e => {
            this.emit('error', e)
        })
    }

    run () {
        this.runOnce()
        this.runIntervalId = setInterval(() => this.runOnce(), this.runinterval)
    }

    isStarted () {
        return this.starttime && true
    }

    isStopped () {
        return this.stoptime && true
    }

    isRunning () {
        return (this.starttime && this.stoptime) && true
    }
}


class TcpTask extends Task {
    constructor (host, schedule, maxNodes, logger) {
        super(host, 'tcp', schedule, maxNodes, logger)
    }

    parseResult (result) {
        const values = { failed: 0 }

        try {
            const times = Object.keys(result).map(k => {
                if ( result[k] ) {
                    if ( result[k][0].hasOwnProperty('error') ) {
                        this.logger.log('debug', 'Got error from %s: %s', k, result[k][0].error)
                        values.failed += 1
                        return null
                    } else {
                        return result[k][0].time
                    }
                } else {
                    this.logger('debug', 'Got something strange from %s: %s', k, JSON.stringify(result[k]))
                    return null
                }
            })

            values.nodes = times.length
            values.probes = times.length
            values.avgtime = times.filter(v=>v).reduce((a,b) => a+b, 0) / (values.nodes - values.failed)
            values.datetime = new Date()
            values.times = times

            this.logger.log('debug', 'Got result: %d nodes, %d probes, %d failed, avg time: %d',
                values.nodes, values.probes, values.failed, values.avgtime)

            return values

        } catch (e) {
            this.logger.log('error', JSON.stringify(result))
            this.emit('error', e)
        }
    }
}


class PingTask extends Task {
    constructor (host, schedule, maxNodes, logger) {
        super(host, 'ping', schedule, maxNodes, logger)
    }

    parseResult (result) {
        const values = {
            failed: 0,
            probes: 0,
        }

        try {
            const times = Object.keys(result).map(k => {
                if ( result[k] && result[k][0] ) {

                    const pvalues = { probes: 0, failed: 0 }

                    return result[k][0].map(ping => {
                        values.probes += 1
                        pvalues.probes += 1

                        if ( ping[0] === 'OK' ) {
                            return ping[1]

                        } else {
                            this.logger.log('debug', 'Got %s from %s.', ping[0], k)
                            values.failed += 1
                            return null
                        }
                    }).filter(v=>v).reduce((a,b) => a+b, 0) / pvalues.probes

                } else if ( result[k] ) {
                    this.logger.log('debug', 'Error getting info from %s: %s', k, result[k][1].message)
                    return null
                } else {
                    this.logger.log('debug', 'Got NULL for host %s.', k, JSON.stringify(result[k]))
                    return null
                }
            })

            values.nodes = times.length
            values.avgtime = times.filter(v=>v).reduce((a,b) => a+b, 0) / values.nodes
            values.datetime = new Date()
            values.times = times

            this.logger.log('debug', 'Got result: %d nodes, %d probes, %d failed, avg time: %d',
                values.nodes, values.probes, values.failed, values.avgtime)

            return values

        } catch (e) {
            this.logger.log('error', 'Some error, so here is the result: %s', JSON.stringify(result))
            this.emit('error', e)
        }
    }
}

module.exports = {
    Task: Task,
    TcpTask: TcpTask,
    PingTask: PingTask,
    taskSchedules: taskSchedules,
}

