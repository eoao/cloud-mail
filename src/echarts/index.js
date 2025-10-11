
import * as echarts from 'echarts/core';

import { BarChart,PieChart,LineChart,GaugeChart} from 'echarts/charts';
// 引入标题，提示框，直角坐标系，数据集，内置数据转换器组件，组件后缀都为 Component
import {
    TooltipComponent,
    GridComponent,
} from 'echarts/components';
// 标签自动布局、全局过渡动画等特性
// 引入 Canvas 渲染器，注意引入 CanvasRenderer 或者 SVGRenderer 是必须的一步
import { CanvasRenderer } from 'echarts/renderers';
import { LegendComponent } from 'echarts/components';
// 注册必须的组件
echarts.use([
    GaugeChart,
    LegendComponent,
    PieChart,
    TooltipComponent,
    GridComponent,
    BarChart,
    LineChart,
    CanvasRenderer
]);

export default echarts