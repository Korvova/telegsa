// api/src/routes/api-v1.js
// External API v1 endpoints for task management
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { logTaskHistory } from '../services/taskHistory.js';

const prisma = new PrismaClient();
const router = Router();

/**
 * Middleware: Authenticate API token
 */
async function authenticateToken(req, res, next) {
  const token = req.query.token || req.headers['x-api-token'];

  if (!token) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'API token required. Pass as ?token=XXX or X-API-Token header'
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { apiToken: token },
      select: { chatId: true, firstName: true, apiToken: true }
    });

    if (!user) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Invalid API token'
      });
    }

    req.apiUser = user;
    next();
  } catch (error) {
    console.error('[API v1] Auth error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: error.message
    });
  }
}

/**
 * GET /api/v1/token/info?chatId=XXX
 * Get token info by chatId (for settings page)
 */
router.get('/token/info', async (req, res) => {
  try {
    const chatId = String(req.query.chatId || '').trim();

    if (!chatId) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'chatId is required'
      });
    }

    const user = await prisma.user.findUnique({
      where: { chatId },
      select: {
        chatId: true,
        firstName: true,
        lastName: true,
        apiToken: true,
        apiTokenCreatedAt: true
      }
    });

    if (!user) {
      return res.status(404).json({
        error: 'not_found',
        message: 'User not found'
      });
    }

    // Generate token if user doesn't have one
    if (!user.apiToken) {
      const newToken = randomUUID();
      const updated = await prisma.user.update({
        where: { chatId },
        data: {
          apiToken: newToken,
          apiTokenCreatedAt: new Date()
        },
        select: {
          chatId: true,
          firstName: true,
          lastName: true,
          apiToken: true,
          apiTokenCreatedAt: true
        }
      });

      return res.json({
        chatId: updated.chatId,
        firstName: updated.firstName,
        lastName: updated.lastName,
        apiToken: updated.apiToken,
        createdAt: updated.apiTokenCreatedAt
      });
    }

    return res.json({
      chatId: user.chatId,
      firstName: user.firstName,
      lastName: user.lastName,
      apiToken: user.apiToken,
      createdAt: user.apiTokenCreatedAt
    });
  } catch (error) {
    console.error('[API v1] Token info error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/token/regenerate
 * Regenerate API token
 */
router.post('/token/regenerate', async (req, res) => {
  try {
    const { chatId } = req.body;

    if (!chatId) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'chatId is required'
      });
    }

    const newToken = randomUUID();
    const user = await prisma.user.update({
      where: { chatId },
      data: {
        apiToken: newToken,
        apiTokenCreatedAt: new Date()
      },
      select: { apiToken: true, apiTokenCreatedAt: true }
    });

    return res.json({
      apiToken: user.apiToken,
      createdAt: user.apiTokenCreatedAt
    });
  } catch (error) {
    console.error('[API v1] Token regenerate error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/tasks/create
 * Create a new task via API
 *
 * Query parameters:
 * - token: API token (required)
 * - groupId: Group ID (required)
 * - text: Task text (required)
 * - assigneeChatId: Assignee chat ID (optional, defaults to token owner)
 * - labelId: Label ID (optional)
 * - watchers: Comma-separated chatIds (optional)
 * - deadline: ISO date string (optional)
 * - acceptCondition: NONE|PHOTO|APPROVAL|PHOTO_AND_APPROVAL|DOC_AND_APPROVAL (optional)
 * - complexity: 1-10 (optional)
 * - notify: true|false (optional, default false)
 */
router.get('/tasks/create', authenticateToken, async (req, res) => {
  try {
    const {
      groupId,
      text,
      assigneeChatId,
      labelId,
      watchers,
      deadline,
      acceptCondition,
      complexity,
      reminderAt,
      reminderTarget
    } = req.query;

    // Validate required fields
    if (!groupId) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'groupId is required'
      });
    }

    if (!text) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'text is required'
      });
    }

    // Check group exists and user has access
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          where: { chatId: req.apiUser.chatId }
        }
      }
    });

    if (!group) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Group not found'
      });
    }

    if (group.ownerChatId !== req.apiUser.chatId && group.members.length === 0) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'You do not have access to this group'
      });
    }

    // Get inbox column for this group
    const column = await prisma.column.findFirst({
      where: {
        chatId: req.apiUser.chatId,
        name: { startsWith: `${groupId}::` }
      },
      orderBy: { order: 'asc' }
    });

    if (!column) {
      return res.status(404).json({
        error: 'not_found',
        message: 'No columns found in this group. Create board first.'
      });
    }

    // Get max order for new task
    const maxOrder = await prisma.task.aggregate({
      where: { columnId: column.id },
      _max: { order: true }
    });

    const order = (maxOrder._max.order || 0) + 1;

    // Prepare task data
    const taskData = {
      chatId: req.apiUser.chatId,
      text: String(text),
      columnId: column.id,
      order,
      createdByChatId: req.apiUser.chatId,
      assigneeChatId: assigneeChatId || req.apiUser.chatId
    };

    // Add optional fields
    if (deadline) {
      try {
        taskData.deadlineAt = new Date(deadline);
      } catch (e) {
        return res.status(400).json({
          error: 'bad_request',
          message: 'Invalid deadline format. Use ISO date string (e.g., 2025-10-08T15:00:00Z)'
        });
      }
    }

    if (acceptCondition) {
      const validConditions = ['NONE', 'PHOTO', 'APPROVAL', 'PHOTO_AND_APPROVAL', 'DOC_AND_APPROVAL'];
      if (!validConditions.includes(acceptCondition)) {
        return res.status(400).json({
          error: 'bad_request',
          message: `Invalid acceptCondition. Must be one of: ${validConditions.join(', ')}`
        });
      }
      taskData.acceptCondition = acceptCondition;
    }

    if (complexity) {
      const comp = parseInt(complexity);
      if (comp < 1 || comp > 10) {
        return res.status(400).json({
          error: 'bad_request',
          message: 'complexity must be between 1 and 10'
        });
      }
      taskData.complexity = comp;
    }

    // Create task
    const task = await prisma.task.create({
      data: taskData
    });

    // Логируем создание задачи через API
    ;(async () => {
      try {
        await logTaskHistory(task.id, 'task_created', req.apiUser.chatId, null, String(text), { source: 'api_v1', groupId });
      } catch (e) {
        console.error('[api-v1] history logging error:', e);
      }
    })().catch(() => {});

    // Add label if provided
    if (labelId) {
      const label = await prisma.groupLabel.findUnique({
        where: { id: labelId }
      });

      if (!label) {
        // Don't fail, just warn
        console.warn('[API v1] Label not found:', labelId);
      } else if (label.groupId !== groupId) {
        console.warn('[API v1] Label belongs to different group:', labelId);
      } else {
        await prisma.taskLabel.create({
          data: {
            taskId: task.id,
            labelId: labelId,
            assignedBy: req.apiUser.chatId
          }
        });
      }
    }

    // Add watchers if provided
    if (watchers) {
      const watcherIds = watchers.split(',').map(id => id.trim()).filter(Boolean);
      for (const watcherId of watcherIds) {
        try {
          await prisma.taskWatcher.create({
            data: {
              taskId: task.id,
              chatId: watcherId
            }
          });
        } catch (e) {
          console.warn('[API v1] Failed to add watcher:', watcherId, e.message);
        }
      }
    }

    // Create reminder if provided
    if (reminderAt) {
      try {
        const fireAt = new Date(reminderAt);
        const target = reminderTarget || 'RESPONSIBLE'; // Default to RESPONSIBLE

        // Validate target
        const validTargets = ['ME', 'RESPONSIBLE', 'ALL'];
        if (!validTargets.includes(target)) {
          console.warn('[API v1] Invalid reminderTarget:', target, 'using RESPONSIBLE');
        }

        await prisma.taskReminder.create({
          data: {
            taskId: task.id,
            target: validTargets.includes(target) ? target : 'RESPONSIBLE',
            fireAt: fireAt,
            createdBy: req.apiUser.chatId
          }
        });

        console.log(`[API v1] Created reminder for task ${task.id} at ${fireAt.toISOString()}, target: ${target}`);
      } catch (e) {
        console.error('[API v1] Failed to create reminder:', e.message);
        // Don't fail the task creation, just warn
      }
    }

    return res.json({
      taskId: task.id,
      text: task.text,
      groupId: groupId,
      columnId: task.columnId,
      createdAt: task.createdAt
    });

  } catch (error) {
    console.error('[API v1] Create task error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/groups
 * Get list of groups where user is owner
 */
router.get('/groups', authenticateToken, async (req, res) => {
  try {
    const groups = await prisma.group.findMany({
      where: { ownerChatId: req.apiUser.chatId },
      select: {
        id: true,
        title: true,
        isTelegramGroup: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({
      groups: groups.map(g => ({
        groupId: g.id,
        title: g.title,
        isTelegramGroup: g.isTelegramGroup,
        createdAt: g.createdAt
      }))
    });

  } catch (error) {
    console.error('[API v1] Get groups error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/groups/:groupId/members
 * Get list of group members with their chatIds
 */
router.get('/groups/:groupId/members', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;

    // Check group access
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          where: { chatId: req.apiUser.chatId }
        }
      }
    });

    if (!group) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Group not found'
      });
    }

    if (group.ownerChatId !== req.apiUser.chatId && group.members.length === 0) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'You do not have access to this group'
      });
    }

    // Get all members
    const members = await prisma.groupMember.findMany({
      where: { groupId },
      select: {
        chatId: true,
        role: true
      }
    });

    // Get user info for all members
    const memberChatIds = members.map(m => m.chatId);
    const users = await prisma.user.findMany({
      where: { chatId: { in: [...memberChatIds, group.ownerChatId] } },
      select: {
        chatId: true,
        firstName: true,
        lastName: true,
        username: true
      }
    });

    const userMap = new Map(users.map(u => [u.chatId, u]));

    const allMembers = [
      {
        chatId: group.ownerChatId,
        firstName: userMap.get(group.ownerChatId)?.firstName || null,
        lastName: userMap.get(group.ownerChatId)?.lastName || null,
        username: userMap.get(group.ownerChatId)?.username || null,
        role: 'owner'
      },
      ...members.map(m => ({
        chatId: m.chatId,
        firstName: userMap.get(m.chatId)?.firstName || null,
        lastName: userMap.get(m.chatId)?.lastName || null,
        username: userMap.get(m.chatId)?.username || null,
        role: m.role
      }))
    ];

    return res.json({
      groupId,
      members: allMembers
    });

  } catch (error) {
    console.error('[API v1] Get group members error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/groups/:groupId/labels
 * Get list of labels in group
 */
router.get('/groups/:groupId/labels', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;

    // Check group access
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          where: { chatId: req.apiUser.chatId }
        }
      }
    });

    if (!group) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Group not found'
      });
    }

    if (group.ownerChatId !== req.apiUser.chatId && group.members.length === 0) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'You do not have access to this group'
      });
    }

    // Get all labels
    const labels = await prisma.groupLabel.findMany({
      where: { groupId },
      select: {
        id: true,
        title: true,
        color: true,
        createdAt: true
      },
      orderBy: { createdAt: 'asc' }
    });

    return res.json({
      groupId,
      labels: labels.map(l => ({
        labelId: l.id,
        title: l.title,
        color: l.color,
        createdAt: l.createdAt
      }))
    });

  } catch (error) {
    console.error('[API v1] Get group labels error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: error.message
    });
  }
});

export { router as apiV1Router };
