const send = (res, status, message, data = null)=>res.status(status).json({ message,data })

module.exports = {
    ok: (res, data, message = 'OK') => send(res, 200, message, data),
    created: (res, data, message = 'Created') => send(res, 201, message, data),
    badRequest: (res, message) => send(res, 400, message),
    notFound: (res, message = 'Resource Not Found') => send(res, 404, message),
    serverError: (res) => send(res, 500, 'There appears to be a Server Error'),
}