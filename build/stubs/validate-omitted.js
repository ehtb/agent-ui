// Stands in for src/validate.js in production builds (`validator: 'omit'`): specs are not validated at mount and the
// grammar summary is empty. Develop and test with the real validator; ship without it.
export const validate = () => [];
export const grammar = Object.freeze({});
export const findJsonProblems = () => [];
export const findShapeProblems = () => [];
