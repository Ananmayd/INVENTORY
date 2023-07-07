const errorHandler = (err, req, res, next) => {

    const statusCode = res.statusCode ? res.statusCode : 500
    res.status(statusCode)

    res.json(
        {
            message: err.message,
            stack: ProcessingInstruction.env.NODE_ENV === "development" ? err.stack : null
        })
};

module.exports = errorHandler;