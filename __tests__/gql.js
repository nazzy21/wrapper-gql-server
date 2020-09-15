"use strict";

const typeDefs = `
scalar DateTime
scalar Object
scalar Array

type User {
	Id: Int!
	login: String
	email: String
	group: Int
	pass: String
	createdAt: DateTime
}

input UserInput {
	login: String
	email: String
	group: Int
	pass: String
}

type Query {
	getUser(Id: Int!): User
}

type Mutation {
	addUser(input: UserInput): User
}
`;

const Users = {
	1: {
		Id: 1,
		login: "admin",
		email: "admin@localhost.com",
		group: 1,
		pass: "admin-area"
	}
};

const resolvers = {
	User: {
		createdAt: () => new Date()
	},
	getUser(__, {Id}) {
		return Users[Id];
	},
	addUser(__, {input}) {
		const maxId = Math.max.apply(null, Object.keys(Users)) + 1;

		input.Id = maxId;
		Users[maxId] = input;

		return Users[maxId];
	}
};

const directives = [];

const server = require("./server");

server([{typeDefs, resolvers}], directives, {});

test("Query: getUser", async () => {
	const res = await Request.get("/graphql")
		.send({
			query: `query
				GETUSER($Id: Int!) {
					getUser(Id: $Id) {
						Id
						login
						email
						pass
						createdAt
					}
				}
			`,
			variables: {
				Id: 1
			}
		});

	const user = res.body.data.getUser;

	expect(user.Id).toBe(1);
	expect(user.email).toBe("admin@localhost.com");
});

test("Mutation: addUser", async () => {
	let res = await Request.post('/graphql')
        .send({
            query: `mutation
            	ADDUSER($userInput: UserInput) {
	                addUser(input: $userInput) {
	                	Id
	                	login
	                	email
	                	group
	                	pass
	                	createdAt
	                }
	            }
            `,
            variables: {
            	userInput: {
            		login: "tester",
	            	email: "tester@localhost.com",
	            	group: 1,
	            	pass: "admin"
            	}
            }
        });

    const user = res.body.data.addUser;

    expect(user.login).toBe("tester");
});