// rgtrace: attach to the game's java.exe, capture Game::write and BattleLogic snapshot output.
// Build (x86): cl /nologo /O1 rgtrace.c
// Usage: rgtrace <pid> <outdir>   (pid of the game's java.exe; run tools/rgtrace/lengths.js on the log afterwards)
#define _CRT_SECURE_NO_WARNINGS
#include <windows.h>
#include <stdio.h>
#include <wchar.h>

#define IMAGE_BASE 0x10000000u
enum { K_SBL_INIT, K_GAME_WRITE, K_SNAP_SAVE, K_RET };
typedef struct { DWORD va; int kind; BYTE orig; int armed; DWORD tid; DWORD stream; DWORD ent[6]; int forKind; } BP;

static BP bps[64]; static int nbp;
static HANDLE proc; static DWORD base; static char outdir[MAX_PATH]; static int dumpNo;
static int pendingRearm = -1;

static DWORD rd(DWORD a) { DWORD v = 0; ReadProcessMemory(proc, (LPCVOID)a, &v, 4, NULL); return v; }
static void wr(DWORD a, DWORD v) { WriteProcessMemory(proc, (LPVOID)a, &v, 4, NULL); }
static void arm(BP *b) {
  BYTE cc = 0xCC; ReadProcessMemory(proc, (LPCVOID)b->va, &b->orig, 1, NULL);
  WriteProcessMemory(proc, (LPVOID)b->va, &cc, 1, NULL); FlushInstructionCache(proc, (LPCVOID)b->va, 1); b->armed = 1;
}
static void disarm(BP *b) {
  WriteProcessMemory(proc, (LPVOID)b->va, &b->orig, 1, NULL); FlushInstructionCache(proc, (LPCVOID)b->va, 1); b->armed = 0;
}
static BP *add(DWORD va, int kind) { BP *b = &bps[nbp++]; memset(b, 0, sizeof *b); b->va = va; b->kind = kind; arm(b); return b; }
static DWORD rel(DWORD va) { return va - IMAGE_BASE + base; }

// ostream p sits at MemoryStream+8; MemoryStream fields: +0x10 capacity, +0x14 buffer, +0x1c..+0x28 positions.
static void streamFields(DWORD p, DWORD f[6]) { for (int i = 0; i < 6; i++) f[i] = rd(p - 8 + 0x10 + i * 4); }

static void dump(BP *r) {
  DWORD f[6]; streamFields(r->stream, f);
  DWORD cap = f[0], buf = f[1];
  const char *name = r->forKind == K_GAME_WRITE ? "game" : "snapshot";
  printf("%s returned: stream=%08lx entry fields", name, r->stream);
  for (int i = 0; i < 6; i++) printf(" %lx", r->ent[i]);
  printf(" | exit fields"); for (int i = 0; i < 6; i++) printf(" %lx", f[i]); printf("\n");
  if (cap == 0 || cap > 16 * 1024 * 1024 || !buf) return;
  BYTE *data = malloc(cap); SIZE_T got = 0; ReadProcessMemory(proc, (LPCVOID)buf, data, cap, &got);
  char path[MAX_PATH]; sprintf(path, "%s\\%02d_%s.bin", outdir, ++dumpNo, name);
  FILE *fp = fopen(path, "wb"); fwrite(data, 1, got, fp); fclose(fp); free(data);
  printf("  wrote %s (%lu bytes of capacity)\n", path, (unsigned long)got); fflush(stdout);
}

static void onBreak(DEBUG_EVENT *ev) {
  DWORD addr = (DWORD)ev->u.Exception.ExceptionRecord.ExceptionAddress;
  BP *b = NULL; int idx = -1;
  for (int i = 0; i < nbp; i++) if (bps[i].va == addr && bps[i].armed) { b = &bps[i]; idx = i; break; }
  if (!b) return;
  HANDLE th = OpenThread(THREAD_ALL_ACCESS, FALSE, ev->dwThreadId);
  CONTEXT c; c.ContextFlags = CONTEXT_FULL; GetThreadContext(th, &c);
  if (b->kind == K_RET && b->tid != ev->dwThreadId) { // another thread hit the return address: step over it
    disarm(b); c.Eip = addr; c.EFlags |= 0x100; pendingRearm = idx; SetThreadContext(th, &c); CloseHandle(th); return;
  }
  disarm(b); c.Eip = addr;
  switch (b->kind) {
  case K_SBL_INIT: {
    DWORD flags = rd(c.Ecx + 0x90); wr(c.Ecx + 0x90, flags | 2);
    printf("ServerBattleLogic init this=%08lx flags %lx -> %lx\n", c.Ecx, flags, flags | 2); fflush(stdout);
    break; }
  case K_GAME_WRITE: case K_SNAP_SAVE: {
    DWORD esp = c.Esp, ret = rd(esp), stream = rd(esp + 4);
    BP *r = add(ret, K_RET); r->tid = ev->dwThreadId; r->stream = stream; r->forKind = b->kind; streamFields(stream, r->ent);
    printf("%s called this=%08lx stream=%08lx ret=%08lx\n", b->kind == K_GAME_WRITE ? "Game::write" : "snapshot save", c.Ecx, stream, ret); fflush(stdout);
    break; }
  case K_RET:
    dump(b); b->va = 0; // one-shot
    SetThreadContext(th, &c); CloseHandle(th); return;
  }
  c.EFlags |= 0x100; pendingRearm = idx; // single-step, then re-arm
  SetThreadContext(th, &c); CloseHandle(th);
}

int main(int argc, char **argv) {
  if (argc < 3) { fprintf(stderr, "usage: rgtrace <pid> <outdir>\n"); return 1; }
  DWORD pid = strtoul(argv[1], NULL, 10); strcpy(outdir, argv[2]); CreateDirectoryA(outdir, NULL);
  if (!DebugActiveProcess(pid)) { fprintf(stderr, "attach failed %lu\n", GetLastError()); return 1; }
  DebugSetProcessKillOnExit(FALSE);
  printf("attached to %lu\n", pid); fflush(stdout);
  DEBUG_EVENT ev;
  for (;;) {
    if (!WaitForDebugEvent(&ev, INFINITE)) break;
    DWORD status = DBG_CONTINUE;
    switch (ev.dwDebugEventCode) {
    case CREATE_PROCESS_DEBUG_EVENT: proc = ev.u.CreateProcessInfo.hProcess; break;
    case LOAD_DLL_DEBUG_EVENT: {
      wchar_t path[MAX_PATH] = L"";
      if (ev.u.LoadDll.hFile) GetFinalPathNameByHandleW(ev.u.LoadDll.hFile, path, MAX_PATH, 0);
      if (!base && wcsstr(path, L"ResetGeneration-Win32-Web.dll")) {
        base = (DWORD)ev.u.LoadDll.lpBaseOfDll;
        printf("game dll at %08lx\n", base); fflush(stdout);
        add(rel(0x1000eeb0), K_SBL_INIT);
        add(rel(0x1003c4a0), K_GAME_WRITE);
        add(rel(0x10006a80), K_SNAP_SAVE);
      }
      if (ev.u.LoadDll.hFile) CloseHandle(ev.u.LoadDll.hFile);
      break; }
    case EXCEPTION_DEBUG_EVENT: {
      DWORD code = ev.u.Exception.ExceptionRecord.ExceptionCode;
      if (code == EXCEPTION_BREAKPOINT) onBreak(&ev);
      else if (code == EXCEPTION_SINGLE_STEP && pendingRearm >= 0) { if (bps[pendingRearm].va) arm(&bps[pendingRearm]); pendingRearm = -1; }
      else if (code == 0x4000001F || code == 0x4000001E) {} // WOW64 breakpoints
      else status = DBG_EXCEPTION_NOT_HANDLED;
      break; }
    case EXIT_PROCESS_DEBUG_EVENT: printf("process exited\n"); return 0;
    }
    ContinueDebugEvent(ev.dwProcessId, ev.dwThreadId, status);
  }
  return 0;
}
