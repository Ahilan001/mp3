const {badRequest, serverError} = require('./helpers')

class BadQuery extends Error {}

function parseObject(raw, name){
    if (raw === undefined){
        return undefined
    }
    if (typeof raw !== 'string'){
        throw new BadQuery(`${name} must be a JSON string.`)
    }
    let v
    try {
        v = JSON.parse(raw)
    } catch (e){
        throw new BadQuery(`${name} is not a valid JSON.`)
    }
    if (v === null || typeof v !== 'object' || Array.isArray(v)){
        throw new BadQuery(`${name} must be a JSON object.`)
    }
    return v
}

function parseInt0(raw, name){
    if (raw === undefined){
        return undefined
    }
    if (typeof raw !== 'string' || !/^\d+$/.test(raw)){
        throw new BadQuery(`${name} must be a non-negative integer.`)
    }
    return Number(raw)
}

function parseSelect(raw){
    const select = parseObject(raw, 'select')
    if (!select){
        return undefined
    }
    const vals = Object.entries(select)
    if (!vals.every(([,v]) => v === 0 || v === 1)){
        throw new BadQuery('Select values must be either 1 or 0.')
    }
    const others = vals.filter(([k]) => k !== '_id').map(([,v]) => v)
    if (others.includes(0) && others.includes(1)){
        throw new BadQuery('Select cannot mix both included and excluded fields.')
    }
    return select
}

function parseListQuery(q, defaultLimit){
    const where = parseObject(q.where, 'where') || {}
    if (JSON.stringify(where).includes('$where')){
        throw new BadQuery('where query contains unsupported operator.')
    }
    const sort = parseObject(q.sort, 'sort')
    if (sort && !Object.values(sort).every((v) => v === 1 || v === -1)){
        throw new BadQuery('Sort values must be either 1 or -1.')
    }
    const limit = parseInt0(q.limit, 'limit')
    return {
        where,
        sort,
        select: parseSelect(q.select),
        skip: parseInt0(q.skip, 'skip'),
        limit: limit === undefined ? defaultLimit : limit,
        count: q.count === 'true',
    }
}

function handleQueryError(res, e){
    if (e instanceof BadQuery){
        return badRequest(res, e.message)
    }
    if (e.name === 'CastError'){
        return badRequest(res, 'A query value has the wrong type.')
    }
    return serverError(res)
}

module.exports = {parseListQuery, parseSelect, handleQueryError}