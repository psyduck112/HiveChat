'use server';
import { db } from '@/app/db';
import { auth } from "@/auth";
import { eq, and, desc, asc } from 'drizzle-orm';
import { ChatType, MCPToolResponse } from '@/types/llm';
import WebSearchService from '@/app/services/WebSearchService';
import { chats, messages, appSettings, mcpServers, mcpTools, searchEngineConfig } from '@/app/db/schema';
import { WebSearchResponse } from '@/types/search';

export const addChatInServer = async (
  chatInfo: {
    title: string;
    defaultModel?: string;
    defaultProvider?: string;
    historyType?: 'all' | 'none' | 'count';
    historyCount?: number;
    isStar?: boolean;
    isWithBot?: boolean;
    botId?: number;
    avatar?: string;
    avatarType?: 'emoji' | 'url' | 'none';
    prompt?: string;
  }
) => {
  const session = await auth();
  if (!session?.user.id) {
    return {
      status: 'fail',
      message: 'please login first.'
    }
  }
  const result = await db.insert(chats)
    .values({
      ...chatInfo,
      userId: session.user.id
    })
    .returning();
  if (result[0]) {
    return {
      status: 'success',
      data: result[0],
    }
  } else {
    return {
      status: 'fail',
    }
  }
}

export const getChatInfoInServer = async (chatId: string): Promise<{ status: string; data: ChatType | null }> => {
  const session = await auth();
  if (!session?.user.id) {
    return {
      status: 'success',
      data: null
    }
  }
  const result = await db.select()
    .from(chats)
    .where(
      and(
        eq(chats.id, chatId),
        eq(chats.userId, session.user.id),
      ));
  if (result.length > 0) {
    const data = result[0];
    return {
      status: 'success',
      data: {
        id: data.id,
        title: data.title ?? undefined,
        defaultModel: data.defaultModel ?? undefined,
        defaultProvider: data.defaultProvider ?? undefined,
        historyType: data.historyType ?? undefined,
        historyCount: data.historyCount ?? undefined,
        isStar: data.isStar ?? undefined,
        isWithBot: data.isWithBot ?? undefined,
        botId: data.botId ?? undefined,
        avatarType: data.avatarType ?? undefined,
        prompt: data.prompt ?? undefined,
        createdAt: data.createdAt!,
        starAt: data.starAt ?? undefined,
      }
    }
  } else {
    return {
      status: 'fail',
      data: null
    }
  }
}

export const getChatListInServer = async () => {
  const session = await auth();
  if (!session?.user.id) {
    return {
      status: 'success',
      data: []
    }
  }
  const result = await db.select()
    .from(chats)
    .where(
      and(
        eq(chats.userId, session.user.id)
      ))
    .orderBy(desc(chats.createdAt));
  return {
    status: 'success',
    data: result
  }
}

export const updateChatInServer = async (chatId: string, newChatInfo: {
  title?: string;
  defaultModel?: string;
  defaultProvider?: string;
  historyType?: 'all' | 'none' | 'count';
  historyCount?: number;
  isStar?: boolean;
  isWithBot?: boolean;
  botId?: number;
  avatar?: string;
  avatarType?: 'emoji' | 'url' | 'none';
  prompt?: string;
  starAt?: Date;
}) => {
  const session = await auth();
  if (!session?.user.id) {
    return {
      status: 'fail',
      message: 'please login first.'
    }
  }
  const result = await db.update(chats)
    .set(newChatInfo)
    .where(
      and(
        eq(chats.id, chatId),
        eq(chats.userId, session.user.id)
      ));
  return {
    status: 'success',
  }
}

export const updateChatTitleInServer = async (chatId: string, newTitle: string) => {
  const session = await auth();
  if (!session?.user.id) {
    return {
      status: 'fail',
      message: 'please login first.'
    }
  }
  try {
    await db.update(chats)
      .set({
        title: newTitle,
      })
      .where(
        and(
          eq(chats.id, chatId),
          eq(chats.userId, session.user.id)
        ));
    return {
      status: 'success',
    }
  }
  catch {
    return {
      status: 'fail',
    }
  }
}

export const deleteChatInServer = async (chatId: string) => {
  const session = await auth();
  if (!session?.user.id) {
    return {
      status: 'fail',
      message: 'please login first.'
    }
  }
  const result = await db.delete(chats)
    .where(
      and(
        eq(chats.id, chatId),
        eq(chats.userId, session.user.id)
      ));
  await db.delete(messages)
    .where(
      and(
        eq(messages.chatId, chatId),
        eq(messages.userId, session.user.id)
      ));

  return {
    status: 'success',
  }

}

export const deleteAllUserChatInServer = async () => {
  const session = await auth();
  if (!session?.user.id) {
    return {
      status: 'fail',
      message: 'please login first.'
    }
  }
  const result = await db.delete(chats)
    .where(
      eq(chats.userId, session.user.id)
    );
  await db.delete(messages)
    .where(
      eq(messages.userId, session.user.id)
    );
  return {
    status: 'success',
  }
}

export const fetchAppSettings = async (key: string) => {
  const result = await db.query.appSettings
    .findFirst({
      where: eq(appSettings.key, key)
    });
  return result?.value;
}

export const getMcpServersAndAvailableTools = async () => {
  try {
    const tools = await db
      .select({
        name: mcpTools.name,
        description: mcpTools.description,
        serverName: mcpTools.serverName,
        inputSchema: mcpTools.inputSchema,
      })
      .from(mcpTools)
      .leftJoin(mcpServers, eq(mcpTools.serverName, mcpServers.name))
      .orderBy(
        asc(mcpTools.serverName),
      )
      .where(
        eq(mcpServers.isActive, true)
      );
    const servers = await db.query.mcpServers.findMany({
      where: eq(mcpServers.isActive, true),
      orderBy: [mcpServers.createdAt],
    });
    return {
      tools,
      mcpServers: servers
    };
  } catch (error) {
    return {
      tools: [],
      mcpServers: []
    };
  }
}

export const syncMcpTools = async (messageId: number, mcpToolsResponse: MCPToolResponse[]) => {
  try {
    await db.update(messages)
      .set({
        mcpTools: mcpToolsResponse,
        updatedAt: new Date()
      })
      .where(eq(messages.id, messageId));

    return {
      status: 'success',
      message: '工具信息已保存'
    };
  } catch (error) {
    console.error('同步 MCP 工具响应失败:', error);
    return {
      status: 'fail',
      message: '同步工具失败'
    };
  }
}

export const getSearchResult = async (keyword: string): Promise<{
  status: string;
  message: string;
  data: WebSearchResponse | null;
}> => {
  const session = await auth();
  if (!session?.user) {
    throw new Error('not allowed');
  }

  const searchConfig = await db.query.searchEngineConfig.findFirst({
    where: eq(searchEngineConfig.isActive, true)
  });
  if (searchConfig) {
    console.log(searchConfig);
    try {
      const webSearch = await WebSearchService.search({
        id: searchConfig.id,
        name: searchConfig.name,
        apiKey: searchConfig.apiKey as string
      }, keyword);
      console.log('-------------webSearch--in Server------------')
      console.log(webSearch)
      return {
        status: 'success',
        message: 'success',
        data: webSearch
      }
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        data: null,
      }
    }
  } else {
    return {
      status: 'error',
      message: '管理员未配置搜索',
      data: null
    }
  }
}