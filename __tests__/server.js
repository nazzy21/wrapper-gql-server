const chai = require('chai'),
    chaiHttp = require('chai-http'),
    express = require('express'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    graphHttp = require('express-graphql'),
    app = express(),
    {gql} = require("../dist/lib");

chai.use(chaiHttp);
chai.should();

app.use(cookieParser(),
    bodyParser.json(),
    bodyParser.urlencoded({extended: true})
);

let server;
beforeAll(() => {
    server = app.listen(80, 'localhost');
    global.Request = chai.request.agent(app);
});

afterAll(() => {
    server.close();
    Request.close();
});

module.exports = function(typeDefs, directives, context) {
    app.get('/graphql', gql(typeDefs, directives, context));
    app.post('/graphql', gql(typeDefs, directives, context));
};