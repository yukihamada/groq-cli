import { describe, it, expect, beforeEach } from 'vitest';
import { TodoTool } from './todo-tool';
import { TodoItem, TodoPriority, TodoStatus } from '../types';

describe('TodoTool', () => {
  let todoTool: TodoTool;

  beforeEach(() => {
    todoTool = new TodoTool();
  });

  describe('createTodoList', () => {
    it('should create a new todo list', async () => {
      const todos: TodoItem[] = [
        { id: '1', content: 'Write tests', status: 'pending', priority: 'high' },
        { id: '2', content: 'Fix bugs', status: 'pending', priority: 'medium' },
        { id: '3', content: 'Update docs', status: 'pending', priority: 'low' }
      ];

      const result = await todoTool.createTodoList(todos);

      expect(result.success).toBe(true);
      expect(result.output).toContain('TODO List created');
      expect(result.output).toContain('Write tests');
      expect(result.output).toContain('Fix bugs');
      expect(result.output).toContain('Update docs');
      expect(result.output).toContain('⏳'); // Pending emoji
      expect(result.output).toContain('🔴'); // High priority
      expect(result.output).toContain('🟡'); // Medium priority
      expect(result.output).toContain('🟢'); // Low priority
    });

    it('should handle empty todo list', async () => {
      const result = await todoTool.createTodoList([]);

      expect(result.success).toBe(true);
      expect(result.output).toContain('TODO List created');
    });

    it('should handle todos with different statuses', async () => {
      const todos: TodoItem[] = [
        { id: '1', content: 'Completed task', status: 'completed', priority: 'high' },
        { id: '2', content: 'In progress task', status: 'in_progress', priority: 'medium' },
        { id: '3', content: 'Pending task', status: 'pending', priority: 'low' }
      ];

      const result = await todoTool.createTodoList(todos);

      expect(result.success).toBe(true);
      expect(result.output).toContain('✅'); // Completed
      expect(result.output).toContain('🔄'); // In progress
      expect(result.output).toContain('⏳'); // Pending
    });

    it('should validate todo items', async () => {
      const invalidTodos = [
        { id: '1', content: '', status: 'pending', priority: 'high' }, // Empty content
      ] as TodoItem[];

      const result = await todoTool.createTodoList(invalidTodos);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid todo item');
    });
  });

  describe('updateTodoList', () => {
    it('should update existing todos', async () => {
      // First create a todo list
      const todos: TodoItem[] = [
        { id: '1', content: 'Task 1', status: 'pending', priority: 'high' },
        { id: '2', content: 'Task 2', status: 'pending', priority: 'medium' }
      ];

      await todoTool.createTodoList(todos);

      // Update the todos
      const updates = [
        { id: '1', status: 'in_progress' as TodoStatus },
        { id: '2', status: 'completed' as TodoStatus }
      ];

      const result = await todoTool.updateTodoList(updates);

      expect(result.success).toBe(true);
      expect(result.output).toContain('TODO List updated');
      expect(result.output).toContain('🔄'); // In progress
      expect(result.output).toContain('✅'); // Completed
    });

    it('should handle updates before creating list', async () => {
      const updates = [
        { id: '1', status: 'completed' as TodoStatus }
      ];

      const result = await todoTool.updateTodoList(updates);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No existing todo list');
    });

    it('should handle invalid todo ID', async () => {
      const todos: TodoItem[] = [
        { id: '1', content: 'Task 1', status: 'pending', priority: 'high' }
      ];

      await todoTool.createTodoList(todos);

      const updates = [
        { id: 'invalid-id', status: 'completed' as TodoStatus }
      ];

      const result = await todoTool.updateTodoList(updates);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Todo with id invalid-id not found');
    });

    it('should update multiple properties', async () => {
      const todos: TodoItem[] = [
        { id: '1', content: 'Task 1', status: 'pending', priority: 'low' }
      ];

      await todoTool.createTodoList(todos);

      const updates = [
        { 
          id: '1', 
          status: 'in_progress' as TodoStatus,
          priority: 'high' as TodoPriority,
          content: 'Updated Task 1'
        }
      ];

      const result = await todoTool.updateTodoList(updates);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Updated Task 1');
      expect(result.output).toContain('🔄'); // In progress
      expect(result.output).toContain('🔴'); // High priority
    });

    it('should handle empty updates', async () => {
      const todos: TodoItem[] = [
        { id: '1', content: 'Task 1', status: 'pending', priority: 'high' }
      ];

      await todoTool.createTodoList(todos);

      const result = await todoTool.updateTodoList([]);

      expect(result.success).toBe(true);
      expect(result.output).toContain('TODO List updated');
    });

    it('should validate status updates', async () => {
      const todos: TodoItem[] = [
        { id: '1', content: 'Task 1', status: 'pending', priority: 'high' }
      ];

      await todoTool.createTodoList(todos);

      const updates = [
        { id: '1', status: 'invalid-status' as any }
      ];

      const result = await todoTool.updateTodoList(updates);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid status');
    });

    it('should validate priority updates', async () => {
      const todos: TodoItem[] = [
        { id: '1', content: 'Task 1', status: 'pending', priority: 'high' }
      ];

      await todoTool.createTodoList(todos);

      const updates = [
        { id: '1', priority: 'invalid-priority' as any }
      ];

      const result = await todoTool.updateTodoList(updates);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid priority');
    });
  });

  describe('getCurrentTodos', () => {
    it('should return current todos', async () => {
      const todos: TodoItem[] = [
        { id: '1', content: 'Task 1', status: 'pending', priority: 'high' },
        { id: '2', content: 'Task 2', status: 'completed', priority: 'low' }
      ];

      await todoTool.createTodoList(todos);
      const currentTodos = todoTool.getCurrentTodos();

      expect(currentTodos).toHaveLength(2);
      expect(currentTodos[0]).toEqual(todos[0]);
      expect(currentTodos[1]).toEqual(todos[1]);
    });

    it('should return empty array when no todos', () => {
      const currentTodos = todoTool.getCurrentTodos();
      expect(currentTodos).toEqual([]);
    });
  });
});