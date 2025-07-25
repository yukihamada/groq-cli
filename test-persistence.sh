#!/bin/bash

# Test script to verify Groq's persistence improvements

echo "Testing Groq CLI persistence with a multi-step task..."
echo ""

# Create a test prompt that requires multiple steps
PROMPT="次の作業を全て完了してください:
1. persistence-test.txt というファイルを作成
2. そのファイルに 'Step 1: File created' という文字列を追加
3. ファイルに 'Step 2: Content added' を追加
4. ファイルの最終的な内容を確認して表示
5. persistence-test.txt を削除

全てのステップを完了するまで作業を続けてください。"

# Run the command using headless mode
echo "$PROMPT" | npm run dev -- -p

echo ""
echo "Test complete!"