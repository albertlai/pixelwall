// Utility functions

// Maps one array onto another given a function
function map(arr1, arr2, fn) {
    var result = new Array(arr1.length);
    for (var i = 0; i < arr1.length; i++) {
	result[i] = fn(arr1[i], arr2[i]);
    }
    return result;
}

// Folds the array up given a function
function accumulate(arr, fn) {
    var n = arr[0];
    if (arr.length > 1) {
	for (var i = 1; i < arr.length; i++) {
	    n = fn(arr[i], n);
	}
    }
    return n;
}

function and(a, b) { return parseInt(a) & b; };

function or(a, b) { return parseInt(a) | b; };

if (exports) {
    exports.map = map;
    exports.accumulate = accumulate;
    exports.and = and;
    exports.or = or;
}