# checkhost-micro

`checkhost-micro` is a small utility, which tests host's reachability using
free services offered by check-host.net.

## Local usage

 * `PORT=12345 HOST=google.com npm start`
 * `PORT=12345 HOST=yahoo.com:80 TYPE=tcp npm start`

## now deployment

 * `now -e HOST=google.com`
