### Issue: `km view` => screen goes blank after navigating a bit

### Issue: `debug km view` => debug output shows in console (debug() should only run in main thread - ok?)

### Issue: `km view /tmp/tst-vault3/` => no board found (there was a broken .km in there that I didn't create?)

### Issue: `debug km view` => shows inkx:scheduler, inkx:pipeline constantly running:

```console
inkx:scheduler render #853 complete: 21ms, output: 0 bytes +21ms                                                               │
inkx:scheduler render scheduled +61ms                                                                                          │
inkx:scheduler render #854: 65x121 +0ms                                                                                        │
inkx:pipeline measure: 0ms +61ms                                                                                               │
inkx:pipeline layout: 0ms +0ms                                                                                                 │
inkx:pipeline content: 20ms +20ms                                                                                              │
inkx:pipeline output: 1ms (0 bytes) +1ms                                                                                       │
inkx:pipeline total pipeline: 21ms +0ms                                                                                        │
inkx:scheduler render #854 complete: 21ms, output: 0 bytes +21ms                                                               │
inkx:scheduler render scheduled +60ms                                                                                          │
inkx:scheduler render #855: 65x121 +0ms                                                                                        │
inkx:pipeline measure: 0ms +60ms                                                                                               │
inkx:pipeline layout: 0ms +0ms                                                                                                 │
inkx:pipeline content: 21ms +21ms                                                                                              │
inkx:pipeline output: 0ms (0 bytes) +0ms                                                                                       │
inkx:pipeline total pipeline: 21ms +0ms
...
```
