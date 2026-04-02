# 证据：体感识别稳定性优化 v14

## 证据类型
- 等效证据（单元测试结果）。

## 关键验证点
- 单帧手腕关键点丢失时，举手状态保持连续。
- 连续超过 grace 帧后，举手状态自动失效，不会长期粘连。
- 检测结果短时中断（`keypoints=None`）时，先短暂保留再自动回退。

## 对应测试
- `test_right_hand_up_survives_short_wrist_dropout`
- `test_wrist_dropout_clears_after_grace_frames`
- `test_missing_person_for_short_time_uses_grace_then_recovers`

## 执行结果
- `.\.venv\Scripts\python.exe -m pytest -q`
- 结果：`14 passed`
