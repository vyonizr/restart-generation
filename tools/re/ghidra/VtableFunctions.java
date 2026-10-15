// Creates functions at every .rdata dword that points into .text (vtable slots Ghidra missed).
import ghidra.app.script.GhidraScript;
import ghidra.app.cmd.disassemble.DisassembleCommand;
import ghidra.app.cmd.function.CreateFunctionCmd;
import ghidra.program.model.address.*;
import ghidra.program.model.mem.*;

public class VtableFunctions extends GhidraScript {
    @Override
    public void run() throws Exception {
        Memory mem = currentProgram.getMemory();
        MemoryBlock rdata = mem.getBlock(".rdata"), text = mem.getBlock(".text");
        int created = 0;
        for (Address a = rdata.getStart(); a.compareTo(rdata.getEnd().subtract(4)) < 0; a = a.add(4)) {
            long v = mem.getInt(a) & 0xffffffffL;
            Address t = toAddr(v);
            if (!text.contains(t) || getFunctionAt(t) != null) continue;
            if (getFunctionContaining(t) != null && !getFunctionContaining(t).getEntryPoint().equals(t)) continue;
            // Only targets that look like code starts: preceded by int3/ret padding or a known function end.
            new DisassembleCommand(t, null, true).applyTo(currentProgram, monitor);
            if (getInstructionAt(t) == null) continue;
            if (new CreateFunctionCmd(t).applyTo(currentProgram, monitor)) created++;
        }
        println("created " + created + " functions");
    }
}
