# 私有历史个股导入格式

当前没有 CRSP 授权，也没有自动从 WRDS 下载个股的流程。下述脚本整理已合法取得的年度资料，不声称能从零重建缺失市场数据。不可将授权数据库内容复制进公开仓库，除非另行取得明确再分发许可。

## annual.csv

表头：

```csv
year,id,ticker,name,total_return,coverage_start,coverage_end,source,corporate_actions_reviewed,delisting_reviewed
```

- `id`：永久证券标识，例如 CRSP PERMNO 的字符串。不可仅以 ticker 连接历史。
- `total_return`：小数，不是百分数字符串；`0.1` 代表 10%，`-1` 代表全部损失；NaN、不完整、低于 -1 均拒绝。
- `coverage_start/end`：年界财富口径，必须是上一年的 `12-31` 至本年的 `12-31`；交易日实际值应取适当交易日，标记的是覆盖边界，不声称当日必有交易。
- `source`：可追溯的数据版本、查询及复核文档路径或标识，不能只写一个无法核对的公司名称。
- `corporate_actions_reviewed` / `delisting_reviewed`：均须为字符串 `true`。
- 所有选中持仓下一年的记录也要提供，即使该证券已经离开标普。成员退出不等于持仓消失。

必须由导出者先处理：分红复投、拆股、分拆、并购换股及现金结算、退市收益及后续现金。仅把年末价格相除不符合此格式。年内缺数据不能自动用零收益替代。

若使用 CRSP 旧版 `RET` + `DLRET`，仅在同一期间两者含义确认且不重复包含时使用 `(1+RET)*(1+DLRET)-1`；CRSP 新版 CIZ 与旧版口径不同，不可盲目套用。退市收益未知时保持未知；无需武断假设 -30% 或 -100%。本项目不自动执行此合并，因为没有足够的原始事件资料和版本信息来判断重复计入。

## membership.csv

```csv
id,start,end,source
```

`start/end` 为 ISO 日期，本导入格式按两端包含处理。若来源以独占结束日或生效交易日表示，导出者应先规范化。脚本以每年 `12-31` 的当时成员形成候选母集。不要用 WRDS 教学变更摘录或今天的成分股填充。

## audit.json

这是结构模板，字符串为占位说明，不是可用市场数据：

```json
{
  "reviewer": "负责核验的人或流程标识",
  "licenseEvidence": "数据使用许可依据；原始文件只存本机",
  "years": {
    "1957": {
      "source": "完整年末成分母集及总回报的核验记录",
      "completePointInTimeUniverse": true,
      "expectedMembers": 500,
      "excludedIncompleteYearIds": []
    }
  }
}
```

`expectedMembers` 必须填来源实际证券数量，**不要求每年刚好 500**（多类别股票会影响证券数）。示例中的 500 只是模板，不是历史事实。记录必须来自独立复核，而不是由输入 CSV 的行数抄回去。

不具完整自然年回报的 IPO 可在 `excludedIncompleteYearIds` 明确列出；这会改变策略母集，必须在研究报告披露。其他成分缺收益会直接报错，不能为了程序通过而加入排除列表。

## 输出及浏览器使用

默认输出 `data/private/stocks.json`，`redistribution=local-only`。网页导入时要求 `schemaVersion=1`、许可说明、完整排名母集和年度回报。`public/data/stock-schema.json` 提供 JSON Schema。

本机文件通过 `<input type=file>` 与 `File.text()` 进入内存；代码不向远端上传、不会保存在 localStorage 或 URL，也不会复制到 `public/`。刷新后需重新导入。分享仅保存配置和公开基准版本；他人须自行有权取得并导入完全相同的私有文件。

程序能验证结构、有限数值、重复标识、数量、年界和缺失；不能代替人核实来源是否真实、许可是否允许使用、母集是否确实包含历史退市股票。
