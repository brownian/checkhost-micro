# checkhost-micro

`checkhost-micro` is a small utility, which tests host's reachability using
free services offered by check-host.net.

For the moment, `checkhost-micro` only collects responses and returns a
summary on demand.

## Local usage

 * `PORT=12345 HOST=google.com npm start`
 * `PORT=12345 HOST=yahoo.com:80 TYPE=tcp npm start`

## now deployment

 * `now -e HOST=google.com`
 * `now -e HOST=volz.ua brownian/checkhost-micro.git`
