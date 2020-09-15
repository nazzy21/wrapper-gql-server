import * as _ from "./utils";
import {
    assertValidExecutionArguments,
    buildExecutionContext,
    collectFields,
    getFieldDef,
    buildResolveInfo,
    execute
} from "graphql/execution/execute";
import {getArgumentValues} from "graphql/execution/values";

/**
 A custom resolvers design to handle all types of graphql requests.

 @private
**/
export default async function executeFn({
	schema,
    document,
    rootValue,
    contextValue,
    variableValues,
    operationName,
    typeResolver
}) {
	assertValidExecutionArguments(schema, document, variableValues);

	const exeContext = buildExecutionContext(
        schema,
        document,
        rootValue,
        contextValue,
        variableValues,
        operationName,
        fieldResolver,
        typeResolver
    );

    // Return early if execution context failed
    if (_.isArray(exeContext)) {
        return {errors: exeContext};
    }

    // Add error object container to the schema
    const _schema = Object.create(schema, {error: {value: Object.create(null)}}),
    	directives = schema.getDirectives();

    // Store directives for easy access
    _schema.Directives = _.indexBy(directives, "name");
    _schema.dirObjList = rootValue.Directive;

    // Create an object holder for object directive type
    _schema.DirObject = {};
    
	return execute({
		schema: _schema,
        document,
        rootValue,
        contextValue,
        variableValues,
        operationName,
        fieldResolver,
        typeResolver
	}).then(res => buildResponse(res, _schema));
}

function getDirectives(fieldNode, schema, variables) {
	const dirs = {before: [], after: []};

	let current = [];
	if (fieldNode.astNode && fieldNode.astNode.directives) {
		current = current.concat(fieldNode.astNode.directives);
	}

	if (fieldNode.directives) {
		current = current.concat(fieldNode.directives);
	}

	if (_.isEmpty(current)) {
		return dirs;
	}

	for(const dirDef of current) {
		const dirName = dirDef.name.value;

		// Check if defined
		if (!schema.Directives[dirName]) {
			continue;
		}

		// Check if callback handler object exist
		if (!schema.dirObjList[dirName]) {
			continue;
		}

		const args = getDirectiveArguments(schema.Directives[dirName], dirDef, variables),
			dirObj = schema.dirObjList[dirName],
			obj = {name: dirName, resolve: dirObj.resolve, args, variables};

		if (dirObj.isBefore) {
			dirs.before.push(obj);

			continue;
		}

		dirs.after.push(obj);
	}

	return dirs;
}

function getDirectiveArguments(directive, dirDef, variables) {
	const args = getArgumentValues(directive, dirDef, variables);

	// Check variable type
	for(const key of _.keys(args)) {
		const value = args[key];

		if (value.match(/^\$\./)) {
			const _key = value.replace("$.", "");

			args[key] = variables[_key];
		}
	}

	return args;
}

function buildResponse(res, _schema) {
	if (res.errors && res.errors.length) {
		const error = res.errors.pop();
		error.code = "serverError";

		res.errors = [error];
	}

	if (!_.isEmpty(_schema.error)) {
		return _.extend({}, res, {error: _schema.error});
	}

	return res;
}

async function fieldResolver(source, args, context, info) {
	const {fieldName, fieldNodes, returnType, parentType, rootValue, schema} = info,
		parentName = parentType.name,
		returnName = returnType.name,
		error = schema.error;

	if (!schema.DirObject[parentName]) {
		const dirs = getDirectives(parentType, schema, args),
			dir = {name: parentName, hasError: false, after: dirs.after};

		// Mark so it won't run again
		schema.DirObject[parentName] = dir;

		for(const dirObj of dirs.before) {
			const res = await dirObj.resolve.call(null, dirObj.args, args, context);

			if (_.isError(res)) {
				dir.hasError = true;
				dir.error = res;
				schema.DirObject[parentName] = dir;

				return res;
			}
		}
	}

	// Don't run if the parent contains error
	if (schema.DirObject[parentName] && schema.DirObject[parentName].hasError) {
		return schema.DirObject[parentName].error;
	}

	let resolver = rootValue[fieldName];

	if (_.isObject(resolver) && resolver.resolve) {
		resolver = resolver.resolve;
	}

	if (isRootType(parentName)) {
		if (!rootValue[fieldName] && rootValue[returnType.name]) {
			// Check root resolvers
			return resolveField(false, rootValue[returnType.name], args, context, info, error);
		}

		return resolveField(false, resolver, args, context, info, error);
	}

	// Sub field
	if (rootValue[parentName] && !source[fieldName]) {
		resolver = rootValue[parentName];

		if (_.isFunction(resolver)) {
			return resolver.call(null, source, args, context, info, error);
		}

		if (resolver[fieldName]) {
			return resolveField(source, resolver[fieldName], args, context, info, error);
		}
	}

	return source[fieldName] || null;
}

function isRootType(name) {
	return 'Query' === name || 'Mutation' === name || 'Subscription' === name;
}

async function resolveField(source, resolver, args, context, info, error) {
	args = args || {};
	
	if (_.isObject(resolver) && resolver.resolve) {
		// Find main resolver
		resolver = resolver.resolve;
	}
	
	// Bail if no resolver found
	if (!resolver) {
		return null;
	}

	const fieldNode = info.fieldNodes[0],
		fieldName = fieldNode.name.value,
		directives = collectDirectives(info.schema),
		fieldDef = getFieldDef(info.schema, info.parentType, fieldName);

	const dirObj = getDirectives(fieldDef, info.schema, args);

	// Execute pre-directives
	if (!_.isEmpty(dirObj.before)) {
		for(const dir of dirObj.before) {
			const res = await dir.resolve.call(null, dir.args, args, context);

			if (_.isError(res)) {
				error[fieldName] = {message: res.message, code: res.code};

				return null;
			}
		}
	}

	let result = await resolver.call(null, source, args, context, info);

	if (_.isError(result)) {
		error[fieldName] = {message: result.message, code: result.code};

		return null;
	}

	// Execute post-directives
	if (!_.isEmpty(dirObj.after)) {
		for(const dir of dirObj.after) {
			result = await dir.resolve.call(null, result, dir.args, context, info);
		}
	}

	return result;
}

function collectDirectives(schema) {
    const dir = {};

    for(const dirObj of schema.getDirectives()) {
        dir[dirObj.name] = dirObj;
    }

    return dir;
}