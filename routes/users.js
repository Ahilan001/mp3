const User = require('../models/user')
const {ok, created, badRequest, notFound, serverError} = require('./helpers')
const {parseListQuery, parseSelect, handleQueryError} = require('./query')

const isValidId = (id) => /^[0-9a-fA-F]{24}$/.test(id)

function parseUserBody(body) {
    body = body || {}
    const out = {}

    if (typeof body.name !== 'string' || body.name.trim() === ''){
        return {error: 'Username missing.'}
    }
    out.name = body.name

    if (typeof body.email !== 'string' || body.email.trim() === ''){
        return {error: 'User email missing.'}
    }
    out.email = body.email

    if (body.pendingTasks === undefined){
        out.pendingTasks = []
    }
    else if (Array.isArray(body.pendingTasks) && body.pendingTasks.every((t) => typeof t === 'string')){
        out.pendingTasks = body.pendingTasks
    }
    else {
        return {error: 'Pending Tasks is not a valid list.'}
    }
    return {value: out}
}

module.exports = function (router){
    router.route('/users')
        .get(async (req, res) => {
            try {
                const q = parseListQuery(req.query, 100)
                if (q.count){
                    return ok(res, await User.countDocuments(q.where))
                }
                let query = User.find(q.where)
                if (q.sort){
                    query = query.sort(q.sort)
                }
                if (q.select){
                    query = query.select(q.select)
                }
                if (q.skip){
                    query = query.skip(q.skip)
                }
                if (q.limit !== undefined){
                    query = query.limit(q.limit)
                }
                return ok(res, await query)
            } catch (e) {
                return handleQueryError(res, e)
            }
        })
        .post(async (req, res) => {
            try {
                const {error, value} = parseUserBody(req.body)
                if (error){
                    return badRequest(res, error)
                }
                const existing = await User.findOne({email: value.email})
                if (existing){
                    return badRequest(res, 'Email already in use.')
                }
                const user = await User.create(value)
                return created(res, user, 'User successfully created.')
            } catch (e){
                return serverError(res)
            }
        })
    router.route('/users/:id')
        .get(async (req, res) => {
            try {
                if (!isValidId(req.params.id)){
                    return notFound(res, 'User Not Found')
                }
                const select = parseSelect(req.query.select)
                const user = await User.findById(req.params.id).select(select || {})
                if (!user){
                    return notFound(res, 'User Not Found')
                }
                return ok(res, user)
            } catch (e){
                return handleQueryError(res, e)
            }
        })
        .put(async (req, res) => {
            try {
                if (!isValidId(req.params.id)){
                    return notFound(res, 'User Not Found')
                }
                const user = await User.findById(req.params.id)
                if (!user){
                    return notFound(res, 'User Not Found')
                }
                const {error, value} = parseUserBody(req.body)
                if (error){
                    return badRequest(res, error)
                }
                const taken = await User.findOne({
                    email: value.email,
                    _id: { $ne: user._id},
                })
                if (taken){
                    return badRequest(res, 'Email already in use.')
                }
                user.set(value)
                await user.save()
                return ok(res, user, 'User updated')
            } catch (e){
                return serverError(res)
            }
        })
        .delete(async (req, res) => {
            try {
                if (!isValidId(req.params.id)){
                    return notFound(res, 'User Not Found')
                }
                const user = await User.findByIdAndDelete(req.params.id)
                if (!user){
                    return notFound(res, 'User Not Found')
                }
                return res.status(204).end()
            } catch (e){
                return serverError(res)
            }
        })
    return router
}