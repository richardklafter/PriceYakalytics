#!/usr/bin/env node

//###############################################################################################################
// This file is an example of how to integrate agiansts Zinc's oauth implementation.
// This script implements the oauth spec but standard oauth libraries should work with Zinc's oauth implementation.
//
// To run this file:
// npm init -y; npm install express --save; npm install request --save; node ./zinc-oauth-example.js
//###############################################################################################################

const url = require('url');
const express = require('express')
const request = require('request-promise-native')
const cookieParser = require('cookie-parser')
const expressHandlebars  = require('express-handlebars');
const bodyParser = require('body-parser');

const ZINC_CLIENT_ID = process.env['ZINC_CLIENT_ID'] //Your zinc client id. We pass it in as an env var so we can open source this application
const ZINC_CLIENT_SECRET = process.env['ZINC_CLIENT_SECRET'] //Your zinc client secret. Super secret treat it like a password
const COOKIE_SECRET = process.env['COOKIE_SECRET'] || ZINC_CLIENT_SECRET //Used to sign cookies so we know they came from us

const app = express()
app.engine('handlebars', expressHandlebars())
app.set('view engine', 'handlebars')
app.set('views', './views')
app.use(cookieParser(COOKIE_SECRET))
app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.static('static'))

function getLoggedInUser(req){
    if(!req.signedCookies.login) return null
    return JSON.parse(req.signedCookies.login)
}

async function callPriceYak(user, route, options) {
    options = Object.assign({}, options)
    options.headers = {'Authorization': `Bearer ${user.token}`}
    options.json = options.json || true //PriceYak always returns json
    route = "https://www.priceyak.com/v0" + route
    console.log(callPriceYak, route)
    return await request(route, options)
}

async function getStoresAndTemplates(user){
    var stores = (await callPriceYak(user, `/user/${user.sub}/stores`)).stores
    return (await Promise.all(stores.map(async function(store){
        try{
            var template = await callPriceYak(user, `/account/${store.id}/requests/template`)
            Object.assign(store, template)
        } catch(err) {}
        return store
    })))
}

async function getListingTemplates(user, stores){
    return (await Promise.all(stores.map(async function(store){
        try{
            var ret = await callPriceYak(user, `/account/${store.id}/requests/template`)

            ret.store = store
        } catch(err) {
            return null
        }
    }))).filter(i=>i)
}

async function updateListingTemplate(user, store, gaId){
    if(!store.template) return
    var gaUrl = `https://ga-beacon.appspot.com/${gaId}/${ebay}/${store.destination_sellername}/{{itemid}}.gif`
}

app.get('/', async function(req, res){
    var user = getLoggedInUser(req)
    //If the user is not logged in redirect them to login
    if(!user){
        res.redirect('/login')
        res.end()
        return
    }
    //If the user is logged in get their current GA id if they have one
    var stores = await getStoresAndTemplates(user)
    console.log(stores)
    if(stores){
        console.log(await getListingTemplates(user, stores))
        gaId = 'GA-EXAMPLE' //XXX: regex to parse tempalte
    }
    //Render our default page
    res.render('index', { gaId:gaId })
})

app.post('/save', async function(req, res){
    var gaId = req.body.gaId;
    var stores = await callPriceYak(user, `/user/${user.sub}/stores`)
    if(!stores.length){
        res.render('index', { gaId:gaId, error:"You don't appear to have any PriceYak stores"})
        return
    }
    await Promise.all(stores.map(async function(store){
        var template = await callPriceYak(user, `/account/${store.id}/requests/template`)
        console.log(template)
    }))
})

app.get('/logout', (req, res) => {
    res.cookie('login', '', {expires:new Date(Date.now()-1000), httpOnly:true, signed:true, secure:req.get('host').indexOf('localhost')==-1});
    res.redirect('/')
    res.end()
})

app.get('/login', (req, res) => {
    var redirect_uri = `${req.protocol}://${req.get('host')}/oauth` //The url we end up at after oauth
    var scopes = ['openid', 'priceyak:listing_template', 'priceyak:stores'] //These are the list of scopes PriceYakalytics needs to get the users stores and modify their templates
    var loginUrl = `https://login.priceyak.com/oidc/auth?response_type=code&scope=${scopes.join(',')}&client_id=${ZINC_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect_uri)}`
    res.render('login', { loginUrl:loginUrl })
})

app.get('/oauth', async function(req, response){
    //If the user accepts the scopes/permissions you will be sent to your specified redirect_uri with a `code` query param
    var code = url.parse(req.url, true).query.code
    if(!code){
        response.redirect(`/login?error=${url.parse(req.url, true).error}`)
        return
    }
    //We can use the code query param to get a long lived token which can be used call Zinc's API in the future
    var redirect_uri = `${req.protocol}://${req.get('host')}/oauth`
    var body = await request('https://login.zinc.io/oidc/token', {
        method: "POST",
        json: {
            code:code,
            client_id:ZINC_CLIENT_ID,
            client_secret:ZINC_CLIENT_SECRET,
            grant_type:'authorization_code',
            redirect_uri:redirect_uri,
        }
    })
    var token = body.access_token
    //we use the token to get more info about the user
    body = await request('https://login.zinc.io/oidc/userinfo', {headers:{'Authorization':"Bearer "+token}, json:true})
    body.token = token
    //we store the currently logged in user in a cookie for quick access
    response.cookie('login', JSON.stringify(body), {expires:new Date(Date.now()+60*60*1000), httpOnly:true, signed:true, secure:req.get('host').indexOf('localhost')==-1});
    response.redirect('/')
    response.end()
})

app.listen(3000, () => console.log('Example app listening on port 3000!'))
