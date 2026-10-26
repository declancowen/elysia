cmake_minimum_required(VERSION 3.22.1)

project(elysiahighlights LANGUAGES C)

set(ELYSIA_HIGHLIGHTS_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../../..")

add_library(
  elysiahighlights SHARED
  elysia_highlights_jni.c
  "${ELYSIA_HIGHLIGHTS_ROOT}/cpp/elysia_highlights.c"
  "${ELYSIA_HIGHLIGHTS_ROOT}/Vendor/highlights/highlights.c"
  "${ELYSIA_HIGHLIGHTS_ROOT}/Vendor/wasm2c/wasm-rt-impl.c"
  "${ELYSIA_HIGHLIGHTS_ROOT}/Vendor/wasm2c/wasm-rt-mem-impl.c"
)

target_include_directories(
  elysiahighlights
  PRIVATE "${ELYSIA_HIGHLIGHTS_ROOT}/cpp" "${ELYSIA_HIGHLIGHTS_ROOT}/Vendor"
          "${ELYSIA_HIGHLIGHTS_ROOT}/Vendor/highlights" "${ELYSIA_HIGHLIGHTS_ROOT}/Vendor/wasm2c"
)

# Plain malloc memory with explicit bounds checks: no guard-page signal
# handlers competing with ART's.
target_compile_definitions(
  elysiahighlights PRIVATE WASM_RT_USE_MMAP=0 WASM_RT_MEMCHECK_BOUNDS_CHECK=1
                       WASM_RT_SKIP_SIGNAL_RECOVERY=1
)

# The lexers are generated code; keep them fast in debug builds too.
target_compile_options(elysiahighlights PRIVATE -O2)

target_link_options(
  elysiahighlights PRIVATE "-Wl,-z,common-page-size=16384" "-Wl,-z,max-page-size=16384"
)
