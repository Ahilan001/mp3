const Task = require('../models/task')
const User = require('../models/user')
const {ok, created, badRequest, notFound, serverError} = require('./helpers')
const {parseListQuery, parseSelect, handleQueryError} = require('./query')

const isValidId = (id) => /^[0-9a-fA-F]{24}$/.test(id)

//const DELETE_STATUS = 204

function parseTaskBody(body) {
    body = body || {}
    const out = {}

    if (typeof body.name !== 'string' || body.name.trim() === ''){
        return {error: 'Task missing name.'}
    }
    out.name = body.name

    let d = body.deadline
    if (d === undefined || d === null || d === ''){
        return {error: 'Task missing deadline.'}
    }
    if (typeof d === 'string' && /^\d+$/.test(d)){
        d = Number(d)
    }
    if (typeof d !== 'string' && typeof d !== 'number'){
        return {error: 'Deadline not a valid date.'}
    }
    d = new Date(d)
    if (isNaN(d.getTime())){
        return {error: 'Deadline not a valid date.'}
    }
    out.deadline = d

    if (body.description === undefined){
        out.description = ''
    }
    else if (typeof body.description === 'string'){
        out.description = body.description
    }
    else{
        return {error: 'Description not a valid string.'}
    }

    const c = body.completed
    if (c === undefined){
        out.completed = false
    }
    else if (c === true || c === 'true'){
        out.completed = true
    }
    else if (c === false || c === 'false'){
        out.completed = false
    }
    else{
        return {error: 'Completed field needs to be labelled true or false.'}
    }

    if (body.assignedUser === undefined){
        out.assignedUser = ''
    }
    else if (typeof body.assignedUser === 'string'){
        out.assignedUser = body.assignedUser
    }
    else{
        return {error: 'Assigned User is not a valid string.'}
    }

    if (body.assignedUserName === undefined){
        out.assignedUserName = undefined
    }
    else if (typeof body.assignedUserName === 'string'){
        out.assignedUserName = body.assignedUserName
    }
    else {
        return {error: 'Please provide a valid Assigned User Name'}
    }
    return {value: out}
}

async function resolveAssignment(value){
    if (value.assignedUser === ''){
        value.assignedUserName = 'unassigned'
        return {}
    }
    if (!isValidId(value.assignedUser)){
        return {status: 400, error: 'Assigned user does not have valid ID.'}
    }
    const user = await User.findById(value.assignedUser)
    if (!user){
        return {status: 404, error: 'Assigned user not found.'}
    }
    if (value.assignedUserName !== undefined && value.assignedUserName !== user.name){
        return {status: 400, error: 'Username does not match the assigned user.'}
    }
    value.assignedUserName = user.name
    return {}
}

async function syncUsers(task, oldUserId){
    const taskId = String(task._id)
    if (oldUserId && oldUserId !== task.assignedUser){
        await User.updateOne({_id: oldUserId}, {$pull: {pendingTasks: taskId}})
    }
    if (task.assignedUser){
        const op = task.completed ? {$pull: {pendingTasks: taskId}} : {$addToSet: {pendingTasks: taskId}}
        await User.updateOne({_id: task.assignedUser}, op)
    }
}

module.exports = function (router) {
    router.route('/tasks')
        .get(async (req, res) => {
            try {
                const q = parseListQuery(req.query, 100)
                if (q.count){
                    return ok(res, await Task.countDocuments(q.where))
                }
                let query = Task.find(q.where)
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
                const {error, value} = parseTaskBody(req.body)
                if (error) {
                    return badRequest(res, error)
                }
                const a = await resolveAssignment(value)
                if (a.status === 400){
                    return badRequest(res, a.error)
                }
                if (a.status === 404){
                    return notFound(res, a.error)
                }
                const task = await Task.create(value)
                await syncUsers(task, null)
                return created(res, task, 'Task Created')
            } catch (e) {
                return serverError(res)
            }
        })
    router.route('/tasks/:id')
        .get(async (req, res) => {
            try {
                if (!isValidId(req.params.id)){
                    return notFound(res, 'Task Not Found')
                }
                const select = parseSelect(req.query.select)
                const task = await Task.findById(req.params.id).select(select || {})
                if (!task){
                    return notFound(res, 'Task Not Found')
                }
                return ok(res, task)
            } catch (e){
                return handleQueryError(res, e)
            }
        })
        .put(async (req, res) => {
            try {
                if (!isValidId(req.params.id)){
                    return notFound(res, 'Task Not Found')
                }
                const task = await Task.findById(req.params.id)
                if (!task){
                    return notFound(res, 'Task Not Found')
                }
                const {error, value} = parseTaskBody(req.body)
                if (error){
                    return badRequest(res, error)
                }
                const a = await resolveAssignment(value)
                if (a.status === 400){
                    return badRequest(res, a.error)
                }
                if (a.status === 404){
                    return notFound(res, a.error)
                }
                const oldUserId = task.assignedUser
                task.set(value)
                await task.save()
                await syncUsers(task, oldUserId)
                return ok(res, task, 'Task Updated')
            } catch (e){
                return serverError(res)
            }
        })
        .delete(async (req, res) => {
            try {
                if (!isValidId(req.params.id)){
                    return notFound(res, 'Task Not Found')
                }
                const task = await Task.findByIdAndDelete(req.params.id)
                if (!task){
                    return notFound(res, 'Task Not Found')
                }
                if (task.assignedUser){
                    await User.updateOne({_id: task.assignedUser}, {$pull: {pendingTasks: String(task._id)}})
                }

                return res.status(204).end()

                //return ok(res, task, 'Task Deleted')
            } catch (e){
                return serverError(res)
            }
        })
    return router
}