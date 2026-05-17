# `duplicate` scenario — note

The runner's `duplicate` guard rejects two files that parse to the same NNNN
version. On a real filesystem, two files cannot share the same name, and the
regex `^([0-9]{4})_([a-z][a-z0-9_]*)\.sql$` extracts the version _from the
filename prefix_ — so two filenames with the same prefix are the same file.

The `migrations.test.ts` spec covers this by:

1. Asserting the practical case (gap) which exercises the same
   sequence-validation pass.
2. Documenting the duplicate branch as belt-and-braces defensive code,
   verified by static read of `migrations.ts` rather than by fixture.

This directory contains a single file so the scenario name is reserved but
no test currently consumes it as a duplicate trigger.
