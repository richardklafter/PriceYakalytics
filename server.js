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

const ZINC_CLIENT_ID = process.env['ZINC_CLIENT_ID'] //Your zinc client id. We pass it in as an env var so we can open source this application
const ZINC_CLIENT_SECRET = process.env['ZINC_CLIENT_SECRET'] //Your zinc client secret. Super secret treat it like a password
const COOKIE_SECRET = process.env['COOKIE_SECRET'] || ZINC_CLIENT_SECRET //Used to sign cookies so we know they came from us

const app = express(COOKIE_SECRET)
app.engine('handlebars', expressHandlebars())
app.set('view engine', 'handlebars')
app.set('views', './views')
app.use(cookieParser())

app.get('/', (req, res) => {
    if(!req.signedCookies.login){
        res.redirect('/login')
        return
    }
    //XXX: We are already logged in. Render the default page
})

app.get('/login', (req, res) => {
    var redirect_uri = `${req.protocol}://${req.get('host')}/oauth` //The url we end up at after oauth
    var scopes = ['openid', 'priceyak:listing_template', 'priceyak:stores'] //These are the list of scopes PriceYakalytics needs to get the users stores and modify their templates
    var loginUrl = `https://login.priceyak.com/oidc/auth?response_type=code&scope=${scopes.join(',')}&client_id=${ZINC_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect_uri)}`
    res.render('login', { loginUrl:loginUrl })
})

app.get('/oauth', (req, response) => {
    //If the user accepts the scopes/permissions you will be sent to your specified redirect_uri with a `code` query param
    var code = url.parse(req.url, true).query.code
    if(!code){
        response.send("Login failed")
        return
    }
    //We can use the code query param to get a long lived token which can be used call Zinc's API in the future
    var redirect_uri = `${req.protocol}://${req.get('host')}/oauth`
    request('https://login.zinc.io/oidc/token', {
        method: "POST",
        json: {
            code:code,
            client_id:ZINC_CLIENT_ID,
            client_secret:ZINC_CLIENT_SECRET,
            grant_type:'authorization_code',
            redirect_uri:redirect_uri,
        }
    }, (err, res, body) => {
        if (err) {
            console.error(err);
            return response.send("failed to call login.zinc.io and obtain a token")
        }
        //We could save this token to make future calls to Zinc's API
        //in this example we are just going to use it this one time
        var token = body.access_token
        request('https://login.zinc.io/oidc/userinfo', {headers:{'Authorization':"Bearer "+token}, json:true}, (err, res, body)=>{
            if (err) {
                console.error(err);
                return response.send("error calling zinc's api with issued token")
            }
            response.setHeader('Content-type', 'text/plain');
            response.send("Successfully logged in!\n"+JSON.stringify(body,null,2))
        })
    });
})

app.listen(3000, () => console.log('Example app listening on port 3000!'))
