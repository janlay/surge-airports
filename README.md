# surge-airport
Surge机场信息面板

<img width="300" alt="image" src="https://user-images.githubusercontent.com/94615/236473117-eca3c7c2-4b02-4944-ad9d-facd36fb0476.png">

## 主要特性
- [x] 流量消耗进度
- [x] 总流量及使用量
- [x] 预估当前周期使用的流量
- [x] 基于预估可用量给出使用建议
- [x] 支持不限时流量包
- [x] 支持按月或天定期重置流量
- [x] 支持月初重置流量
- [x] 多机场信息展示

## 使用
1. 编辑Surge配置文件，找到 `[Panel]` 部分，添加信息面板配置项：
   
   ```
   Airport 1 = content="Refresh to load data.", script-name=airport1
   ```
   其中：
   - `Airport 1` 为面板标题，可替换为自己想要的标题
   - `Refresh to load data.` 为初始提示内容，可留空或任意输入，脚本正常工作后将被替换
   - `airport1` 为要运行的脚本名称，必须与下面要添加的脚本名称必须保持一致
   
2. 然后，继续找到 `[Script]` 部分，添加脚本配置项：
   
   ```
   airport1 = script-path=https://raw.githubusercontent.com/janlay/surge-airports/master/airport-bar.js, type=generic, argument=https://example.com/subscribe/path
   ```
   其中：
   - `airport1` 为要添加的脚本名称，必须与上面要运行的脚本名称必须保持一致
   - `script-path` 和 `type` 的值不可修改，除非你知道你在做什么
   - `argument`: 大多数情况下，这里配置为机场订阅链接即可

3. 保存Surge配置文件，等待其刷新生效。
4. Surge展示新加入的信息面板，点击右上角刷新按钮查看运行效果。

## 高级配置
所有的配置项都依赖于修改 `[Script]` 部分的 `argument` 值。对于大多数来自机场，仅将其设置为订阅链接即可。这里提供几种使用场景的配置，请举一反三自行理解。

- 购买的是七天流量包（每7天重置可用流量）：  
  `argument=https://example.com/subscribe/path;7;days`
- 购买的是季度流量包（每3月重置可用流量）：  
  `argument=https://example.com/subscribe/path;3;month`
- 每月初自动重置流量，而不是按购买日期计算：  
  `argument=https://example.com/subscribe/path;-1`
- 不展示预估流量（效果与不限时流量包一样）：  
  `argument=https://example.com/subscribe/path;0`

其他提示：
- 所以默认配置相当于：  
  `argument=https://example.com/subscribe/path;1;month`
- 周期使用单复数均可，也不区分大小写，甚至只写首字母也可以
- 周期只支持天 (`day`) 和月 (`month`)
- 不限时流量包永远显示为飞机图标


## 错误处理
与Surge默认逻辑不同，此脚本遇到运行时错误时，会直接在信息面板展示错误信息，而不是继续使用上次的显示内容，遇到错误时，图标会展示为红叉。脚本可捕捉的错误包括：
- 订阅链接错误 / 机场不提供用量信息 / 购买套餐已失效 / 账号状态异常等等：  
  `Missing HTTP Header: subscription-userinfo`
- 订阅已过期  
  `Subscription has expired.`

如遇其他错误，可考虑[发起issue](https://github.com/janlay/surge-airports/issues/new/choose)，但这里不提供任何解决与否的承诺。

# LICENSE
This project uses the MIT license. Please see [LICENSE](https://github.com/janlay/surge-airports/blob/master/LICENSE) for more information.
