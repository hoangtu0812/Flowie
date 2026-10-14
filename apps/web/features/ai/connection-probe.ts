type RpcResult = {
   error?: { message: string };
   result?: {
      tools?: { name: string }[];
      isError?: boolean;
      structuredContent?: Record<string, unknown>;
   };
};
export async function probeConnection(endpoint: string, token: string) {
   const rpc = async (id: number, method: string, params: unknown) => {
      const response = await fetch(endpoint, {
         method: 'POST',
         headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'MCP-Protocol-Version': '2025-03-26',
         },
         body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
         signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
         throw new Error(
            `MCP endpoint returned ${response.status}. Check server availability, allowed origins and the token grant.`
         );
      const payload = (await response.json()) as RpcResult;
      if (payload.error || payload.result?.isError)
         throw new Error(
            payload.error?.message ??
               String(payload.result?.structuredContent?.message ?? 'The scoped read failed.')
         );
      return payload.result;
   };
   await rpc(1, 'initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'Flowie connection check', version: '1.0.0' },
   });
   const tools = await rpc(2, 'tools/list', {});
   const access = await rpc(3, 'tools/call', { name: 'get_my_access', arguments: {} });
   return {
      tools: tools?.tools?.map((tool) => tool.name) ?? [],
      access: access?.structuredContent ?? {},
   };
}
