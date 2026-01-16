# mdtest cmd mode - Persistent subprocess testing

Demonstrates the `cmd="..."` feature for testing REPLs where state persists between commands.

## Simple REPL examples

### cat as echo REPL

Using `cat` as a simple persistent subprocess that echoes input:

```console cmd="cat" minWait=50 maxWait=500
$ hello
hello
$ world
world
```

### bash with persistent state

Variables and state persist between commands:

```console cmd="bash" minWait=50 maxWait=500
$ export FOO=bar
$ echo "FOO is $FOO"
FOO is bar
$ export BAZ=123
$ echo "$FOO and $BAZ"
bar and 123
```

### Working directory persists

```console cmd="bash" minWait=50 maxWait=500
$ cd /tmp
$ pwd
/tmp
$ cd /
$ pwd
/
```

## Note on km sh

The `km sh` command currently reads all input lines at once before processing,
rather than operating as an interactive REPL. For km sh testing, use the `-c`
flag with semicolon-separated commands:

```console
$ echo "test" | cat
test
```

A future enhancement could add true interactive REPL mode to km sh to support
the `cmd="km sh board.md"` syntax.
