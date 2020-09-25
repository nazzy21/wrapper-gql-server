import {buildSchema, extendSchema} from "graphql";
import graphHttp from "express-graphql";
import {parse} from "graphql/language/parser";
import * as _ from "./utils";
import executeFn from "./resolve-field";

/**
 Initialize and sets server side graphql handlers.

 @param {array<Object>} typeDefs
 	The list of gql definitions use in the application.
 @param {array<gqlDirective>} Directives
 	The list of define directives available for use in either server and/or client side.
 @param {object} context
 	An additional object containing properties which may be in use on request resolvers.
 @returns {object}
 	Returns an instance of <GraphQLExpress> object.
**/
export function gql(typeDefs, directives = [], context = {}) {
	// Iterate type definitions
	const defs = [],
		dirList = [],
		resolvers = {};

	// Collection type defintions and resolvers
	typeDefs.map( typeDef => collectDefinitions(typeDef, defs, resolvers));

	// Iterate directives
	directives.map( dir => iterateDirectives(dir, resolvers));

	// Build schema
	let Schema = buildSchema(defs.shift());

	if (!_.isEmpty(defs)) {
		for(const typeDef of defs) {
			const _schema = parse(typeDef);
			Schema = extendSchema(Schema, _schema);
		}
	}

	return graphHttp({
		schema: Schema,
		rootValue: resolvers,
		context,
		graphiql: false,
		customExecuteFn: executeFn
	});
}

function iterateDirectives(dir, resolvers) {
	if (!resolvers.Directive) {
		resolvers.Directive = {};
	}

	resolvers.Directive[dir.name] = dir;
}

function collectDefinitions(typeDef, defs, resolvers) {
	// Just add the definition
	defs.push(typeDef.typeDefs);

	for(const name of Object.keys(typeDef.resolvers)) {
		const subResolvers = typeDef.resolvers[name];

		if ("Directive" === name) {
			return; // Bail, don't include directive resolvers
		}

		if (resolvers[name]) {
			// Merge resolvers
			mergeResolvers(subResolvers, resolvers[name]);
			continue;
		}

		resolvers[name] = subResolvers;
	}
}

function mergeResolvers(fromResolvers, toResolvers) {
	for(const name of Object.keys(fromResolvers)) {
		const value = fromResolvers[name];

		if (!toResolvers[name]) {
			toResolvers[name] = value;
			continue;
		}

		const fromValue = toResolvers[name];

		if (_.isFunction(fromValue)) {
			continue;
		}
		
		_.devAssert(_.isObject(fromValue), `Cannot modify ${name} resolver!`);

		margeResolvers(value, fromValue);
 	}
}

/**
 Creates an object which defines a gql directive.

 @param {string} name
 @param {string} description
 @param {string} depracationReason
 @param {array} locations
 @param {boolean} strict
 	If true, the defined directive will only be available on the server side.
 @param {boolean} isBefore
 	Whether the directive must be executed before the field resolver. If false, the set directive
 	will be triggered after the field resolver is resolved.
 @param {function} resolve
 	A callable function which handles the directive.
 @returns {object}
**/
export function gqlDirective({
	name,
	description = '',
	deprecationReason = '',
	locations = ['Field'],
	strict = false,
	isBefore = false,
	resolve
}) {
	_.devAssert(!_.isEmpty(name), 'No directive name!');
	_.devAssert(!_.isEmpty(locations), 'Specify directive locations!');
	_.devAssert(_.isFunction(resolve), 'resolve must be of type function!');

	const obj = Object.create({name}, {
		name: {value: name},
		description: {value: description},
		deprecationReason: {value: deprecationReason},
		locations: {value: locations},
		strict: {value: strict},
		isBefore: {value: isBefore},
		resolve: {value: resolve}
	});

	return obj;
}