const User = require('../models/user')
const Task = require('../models/task')
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

async function validatePending(ids){
    const unique = [...new Set(ids)]
    if (!unique.every(isValidId)){
        return {status: 400, error: 'Pending Tasks does not have a valid Task ID.'}
    }
    const tasks = await Task.find({_id: {$in: unique}})
    if (tasks.some((t) => t.completed)){
        return {status: 400, error: 'Completed task cannot be in Pending Tasks.'}
    }
    if (tasks.length !== unique.length){
        return {status: 404, error: 'Missing task in Pending Tasks.'}
    }
    return {ids: unique, tasks}
}

async function syncTasks(user, oldIds, tasks){
    const userId = String(user._id)
    const newIds = tasks.map((t) => String(t._id))

    for (const t of tasks){
        if (t.assignedUser && t.assignedUser !== userId){
            await User.updateOne({_id: t.assignedUser}, {$pull: {pendingTasks: String(t._id)}})
        }
    }

    const removed = oldIds.filter((id) => !newIds.includes(id))
    if (removed.length){
        await Task.updateMany(
            {_id: {$in: removed}, assignedUser: userId},
            {assignedUser: '', assignedUserName: 'unassigned'}
        )
    }
    if (newIds.length){
        await Task.updateMany(
            {_id: {$in: newIds}},
            {assignedUser: userId, assignedUserName: user.name}
        )
    }

    await Task.updateMany({assignedUser: userId}, {assignedUserName: user.name})
}

module.exports = function (router){
    router.route('/users')
        .get(async (req, res) => {
            try {
                const q = parseListQuery(req.query, undefined)
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

                const p = await validatePending(value.pendingTasks)
                if (p.status === 400){
                    return badRequest(res, p.error)
                }
                if (p.status === 404){
                    return notFound(res, p.error)
                }
                value.pendingTasks = p.ids

                const user = await User.create(value)
                await syncTasks(user, [], p.tasks)
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

                const p = await validatePending(value.pendingTasks)
                if (p.status === 400){
                    return badRequest(res, p.error)
                }
                if (p.status === 404){
                    return notFound(res, p.error)
                }
                value.pendingTasks = p.ids

                const oldIds = [...user.pendingTasks]
                user.set(value)
                await user.save()
                await syncTasks(user, oldIds, p.tasks)
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
                await Task.updateMany(
                    {assignedUser: String(user._id)},
                    {assignedUser: '', assignedUserName: 'unassigned'}
                )
                return res.status(204).end()
            } catch (e){
                return serverError(res)
            }
        })
    return router
}