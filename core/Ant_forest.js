/*
 * @Author: NickHopps
 * @Last Modified by: NickHopps
 * @Last Modified time: 2019-03-14 10:29:30
 * @Description: 蚂蚁森林操作集
 */

function Ant_forest(automator, unlock) {
  const _automator = automator,
        _unlock = unlock,
        _config = storages.create("ant_forest_config"),
        _package_name = "com.eg.android.AlipayGphone";

  let _pre_energy = 0,       // 记录收取前能量值
      _post_energy = 0,      // 记录收取后能量值
      _timestamp = 0,        // 记录获取自身能量倒计时
      _min_countdown = 0,    // 最小可收取倒计时
      _current_time = 0,     // 当前收集次数
      _fisrt_running = true, // 是否第一次进入蚂蚁森林
      _has_next = true,      // 是否下一次运行
      _avil_list = [],       // 可收取好友列表
      _has_protect = [];     // 开启能量罩好友

  /***********************
   * 综合操作
   ***********************/

  // 进入蚂蚁森林主页
  const _start_app = function() {
    app.startActivity({        
      action: "VIEW",
      data: "alipays://platformapi/startapp?appId=60000002",    
    });
  }

  // 关闭提醒弹窗
  const _clear_popup = function() {
    // 合种/添加快捷方式提醒
    threads.start(function() {
      let popup = idEndsWith("J_pop_treedialog_close").findOne(_config.get("timeout_findOne"));
      if (popup) popup.click();
    });
    // 活动
    threads.start(function() {
      let popup = descEndsWith("关闭蒙层").findOne(_config.get("timeout_findOne"));
      if (popup) popup.click();
    }); 
  }

  // 显示文字悬浮窗
  const _show_floaty = function(text) {
    let window = floaty.window(
      <card cardBackgroundColor = "#aa000000" cardCornerRadius = "20dp">
        <horizontal w = "250" h = "40" paddingLeft = "15" gravity="center">
          <text id = "log" w = "180" h = "30" textSize = "12dp" textColor = "#ffffff" layout_gravity="center" gravity="left|center"></text>
          <card id = "stop" w = "30" h = "30" cardBackgroundColor = "#fafafa" cardCornerRadius = "15dp" layout_gravity="right|center" paddingRight = "-15">
            <text w = "30" h = "30" textSize = "16dp" textColor = "#000000" layout_gravity="center" gravity="center">×</text>
          </card>
        </horizontal>
      </card>
    );
    window.stop.on("click", () => {
      engines.stopAll();
    });
    setInterval(()=>{
      ui.run(function(){
        window.log.text(text)
      });
    }, 0);
  }

  // 同步获取 toast 内容
  const _get_toast_sync = function(filter, limit, exec) {
    filter = (typeof filter == null) ? "" : filter;
    let messages = threads.disposable();
    // 在新线程中开启监听
    let thread = threads.start(function() {
      let temp = [];
      let counter = 0;
      // 监控 toast
      events.onToast(function(toast) {
        if (toast) {
          if (toast.getPackageName().indexOf(filter) >= 0) {
            counter++;
            temp.push(toast.getText())
            if (counter == limit) messages.setAndNotify(temp);
          }
        }
      });
      // 触发 toast
      exec();
    });
    // 获取结果
    let result = messages.blockedGet();
    thread.interrupt();
    return result;
  }

  /***********************
   * 获取下次运行倒计时
   ***********************/

  // 获取自己的能量球中可收取倒计时的最小值
  const _get_min_countdown_own = function() {
    let target = className("Button").descMatches(/\s/).filter(function(obj) {
      return obj.bounds().height() / obj.bounds().width() > 1.05; 
      //return obj.bounds().bottom > device.height / 4; 
    });
    if (target.exists()) {
      let ball = target.untilFind();
      let temp = [];
      log("找到" + ball.length + "个自己的能量球");
    /*
    var filters = className("android.widget.Button").filter(function (o) {
      var desc = o.contentDescription;
        return (null !== desc.match(/^收集能量|^\s?$/) && o.bounds().bottom > 300 * 2160 / 1280);
    }).find()
    var num = filters.length;
    log("找到" + num + "个能量球");
    if (filters.length>=1) {
      let temp = [];
      let toasts = _get_toast_sync(_package_name, filters.length, function() {
          _automator.clickMultiCenter(filters);
          sleep(500);
      });
      */
      let toasts = _get_toast_sync(_package_name, ball.length, function() {
        ball.forEach(function(obj) {
          _automator.clickCenter(obj);
          sleep(300);
        });
      });
      toasts.forEach(function(toast) {
        let countdown = toast.match(/\d+/g);
        temp.push(countdown[0] * 60 - (-countdown[1]));
      });
      _min_countdown = Math.min.apply(null, temp);
      log("countdown_own:"+_min_countdown)
      _timestamp = new Date();
    } else {
      _min_countdown = null;
      log("无可收取能量");
    }
  }

  // 确定下一次收取倒计时
  const _get_min_countdown = function() {
    let temp = [];
    if (_min_countdown && _timestamp instanceof Date) {
      let countdown_own = _min_countdown - Math.floor((new Date() - _timestamp) / 60000);
      countdown_own >= 0 ? temp.push(countdown_own) : temp.push(0);
    }
    if (descEndsWith("’").exists()) {
      descEndsWith("’").untilFind().forEach(function(countdown) {
        let countdown_fri = parseInt(countdown.desc().match(/\d+/));
        temp.push(countdown_fri);
      });
    }
    if (!temp.length) return;
    _min_countdown = Math.min.apply(null, temp);
  }

  /***********************
   * 构建下次运行操作
   ***********************/

  // 构建下一次运行
  const _generate_next = function() {
    if (_config.get("is_cycle")) {
      if (_current_time < _config.get("cycle_times")) {
        _has_next = true;
      } else {
        _has_next = false;
      }
    } else {
      if (_min_countdown != null && _min_countdown <= _config.get("max_collect_wait_time")) {
        _has_next = true;
      } else {
        _has_next = false;
      } 
    }
  }

  // 按分钟延时
  const _delay = function (minutes) {
    minutes = typeof minutes != null ? minutes : 0;
    if (minutes === 0) {
      // delay时间为0时直接跳过
      return;
    }
    let startTime = new Date().getTime();
    let timestampGap = minutes * 60000;
    let i = 0;
    for (;;) {
      let now = new Date().getTime();
      if (now - startTime >= timestampGap) {
        // 当前已经过时间大于设定的延迟时间则直接退出
        break;
      }
      i = now - startTime;
      let left = timestampGap - i;
      toastLog("距离下次运行还有 " + (left/60000).toFixed(2) + " 分钟");
      if (left > 15000) {
        // 剩余时间大于三十秒时 睡眠30秒
        // 锁屏情况下的30秒可能实际时间有五分钟之久，如果不能忍受这个长度可以再改小一点比如10秒之类的
        sleep(15000);
      } else {
        // 剩余时间小于30秒时 直接等待实际时间
        sleep(left);
      }
    }
  }

  /*
  const _delay = function(minutes) {
    minutes = (typeof minutes != null) ? minutes : 0;
    tensecs = minutes * 6 - 1
    for (let i = 0; i <= tensecs; i++) {
      if (i == tensecs) {
        toast("10秒钟后即将开始收取");
        sleep(5000);
        toast("5秒钟后将开始收取");
        sleep(2000);
        toast("3秒钟后开始收取");
        sleep(3000);
        break;
      }
      if(i%6==0){
        toastLog("距离下次运行还有 " + minutes-- + " 分钟");
      }
      //toast("距离下次运行还有 " + (tensecs - i)*10 + " 秒钟");
      toast("虹霞小可爱😘");
      sleep(10000);
    }
  }
  */

  /***********************
   * 记录能量
   ***********************/

  // 记录当前能量
  const _get_current_energy = function() {
    if (descEndsWith("背包").exists()) {
      return parseInt(descEndsWith("g").findOne(_config.get("timeout_findOne")).desc().match(/\d+/));
    }
  }

  // 记录初始能量值
  const _get_pre_energy = function() {
    if (_fisrt_running && _has_next) {
      _pre_energy = _get_current_energy();
      log("当前能量：" + _pre_energy);
    }
  }

  // 记录最终能量值
  const _get_post_energy = function() {
    if (!_fisrt_running && !_has_next) {
      if (descEndsWith("返回").exists()) descEndsWith("返回").findOne(_config.get("timeout_findOne")).click();
      descEndsWith("背包").waitFor();
      _post_energy = _get_current_energy();
      log("当前能量：" + _post_energy);
      _show_floaty("共收取：" + (_post_energy - _pre_energy) + "g 能量");
    }
    if (descEndsWith("关闭").exists()) descEndsWith("关闭").findOne(_config.get("timeout_findOne")).click();
    home();
  }

  /***********************
   * 收取能量
   ***********************/

  // 收取能量
  const _collect = function() {
    if (descEndsWith("克").exists()) {
      descEndsWith("克").untilFind().forEach(function(ball) {
        _automator.clickCenter(ball);
        sleep(200);
      });
    }
  }

  // 收取能量同时帮好友收取
  const _collect_and_help = function() {
    let screen = captureScreen();
    // 收取好友能量
    _collect();
    // 帮助好友收取能量
    if (className("Button").descMatches(/\s/).exists()) {
      className("Button").descMatches(/\s/).untilFind().forEach(function(ball) {
        let x = ball.bounds().left,
            y = ball.bounds().top,
            w = ball.bounds().width(),
            h = ball.bounds().height(),
            t = _config.get("color_offset");
        if (images.findColor(screen, "#F99236", {region: [x, y, w, h], threshold: t})) {
        // if (true) {
          _automator.clickCenter(ball);
          sleep(200);
        }
        // sleep(300);
      });
    }
  }
  
  // 判断是否可收取
  const _is_obtainable = function(obj, screen) {
    let len = obj.childCount();
    let x = obj.child(len - 3).bounds().right,
        y = obj.bounds().top,
        w = 5,
        h = obj.bounds().height() - 10,
        t = _config.get("color_offset");
    if (h > 0 && !obj.child(len - 2).childCount()) {
      if (_config.get("help_friend")) {
        return images.findColor(screen, "#1DA06D", {region: [x, y, w, h], threshold: t}) || images.findColor(screen, "#F99236", {region: [x, y, w, h], threshold: t});
      } else {
        return images.findColor(screen, "#1DA06D", {region: [x, y, w, h], threshold: t});
      }
    } else {
      return false;
    }
  }

  // 记录好友信息
  const _record_avil_list = function(fri) {
    let temp = {};
    // 记录可收取对象
    temp.target = fri.bounds();
    // 记录好友ID
    if (fri.child(1).desc() == "") {
      temp.name = fri.child(2).desc();
    } else {
      temp.name = fri.child(1).desc();
    }
    // 记录是否有保护罩
    temp.protect = false;
    _has_protect.forEach(function(obj) {
      if (temp.name == obj) temp.protect = true
    });
    // 添加到可收取列表
    if (_config.get("white_list").indexOf(temp.name) < 0) _avil_list.push(temp);
  }

   // 判断并记录保护罩
   const _record_protected = function(toast) {
    if (toast.indexOf("能量罩") > 0) {
      let title = textContains("的蚂蚁森林").findOne(_config.get("timeout_findOne")).text();
      _has_protect.push(title.substring(0, title.indexOf("的")));
    }
  }

  // 检测能量罩
  const _protect_detect = function(filter) {
    filter = (typeof filter == null) ? "" : filter;
    // 在新线程中开启监听
    return threads.start(function() {
      events.onToast(function(toast) {
        if (toast.getPackageName().indexOf(filter) >= 0) _record_protected(toast.getText());
      });
    });
  }

  // 根据可收取列表收取好友
  const _collect_avil_list = function() {
    while (_avil_list.length) {
      let obj = _avil_list.shift();
      if (!obj.protect) {
        let temp = _protect_detect(_package_name);
        _automator.click(obj.target.centerX(), obj.target.centerY());
        descEndsWith("浇水").waitFor();
        if (_config.get("help_friend")) {
          _collect_and_help();
        } else {
          _collect();
        }
        _automator.back();
        temp.interrupt();
        while(!textContains("好友排行榜").exists()) sleep(500);
      }
    }
  }

  // 识别可收取好友并记录
  const _find_and_collect = function() {
    do {
      if (descEndsWith("查看更多").exists()) {
        _automator.clickCenter(descEndsWith("查看更多").findOne(_config.get("timeout_findOne")));
      }
      let screen = captureScreen();
      let friends_list = idEndsWith("J_rank_list").findOne(_config.get("timeout_findOne"));
      if (friends_list) {
        friends_list.children().forEach(function(fri) {
          if (fri.visibleToUser() && fri.childCount() > 3)
            if (_is_obtainable(fri, screen)) _record_avil_list(fri);
        });
        _collect_avil_list();
      }
      scrollDown();
      sleep(500);
    } while (!(descEndsWith("没有更多了").exists() && descEndsWith("没有更多了").findOne(_config.get("timeout_findOne")).bounds().centerY() < device.height));
  }

  // 监听音量上键结束脚本运行
  const _listen_stop = function() {
    threads.start(function () {
        toast("即将收取能量，按音量上键停止");
        events.observeKey();
        events.onceKeyDown("volume_up", function (event) {
            engines.stopAll();
            exit();
          });
    });
  };

  /***********************
   * 主要函数
   ***********************/

  // 收取自己的能量
  const _collect_own = function() {
    log("开始收集自己能量");
    if (!textContains("蚂蚁森林").exists()) _start_app();
    descEndsWith("背包").waitFor();
    _clear_popup();
    _get_pre_energy();
    _collect();
    if (!_config.get("is_cycle")) _get_min_countdown_own();
    _fisrt_running = false;
  }

  // 收取好友的能量
  const _collect_friend = function() {
    log("开始收集好友能量");
    descEndsWith("查看更多好友").findOne(_config.get("timeout_findOne")).click();
    while(!textContains("好友排行榜").exists()) sleep(500);
    _find_and_collect();
    if (!_config.get("is_cycle")) _get_min_countdown();
    _generate_next();
    _get_post_energy();
  }

  return {
    exec: function() {
      let thread = threads.start(function() {
        events.setMaxListeners(0);
        events.observeToast();
      });
      while (true) {
        log("_min_countdown:"+_min_countdown)
        _delay(_min_countdown);
        _listen_stop();
        log("第 " + (++_current_time) + " 次运行");
        _unlock.exec();
        _collect_own();
        _collect_friend();
        if (_config.get("is_cycle")) sleep(500);
        events.removeAllListeners();
        if (_has_next == false) {
          log("收取结束");
          break;
        }
      }
      thread.interrupt();
    }
  }
}

module.exports = Ant_forest;
