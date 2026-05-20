function timer(cd) {
    cd ??= 0;
    return new Date().getTime() - cd;
}


module.exports = {timer}