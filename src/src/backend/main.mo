import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Array "mo:core/Array";
import Order "mo:core/Order";
import Nat "mo:core/Nat";

actor PixelGridiron {

  type CareerStage = { #HighSchool; #College; #Pro; #SuperBowl; #HallOfFame };

  type Skills = {
    speed : Nat;
    power : Nat;
    agility : Nat;
    spin : Nat;
    hurdle : Nat;
  };

  type PlayerProfile = {
    xp : Nat;
    hp : Nat;
    level : Nat;
    skillPoints : Nat;
    highScore : Nat;
    careerStage : CareerStage;
    unlockedLegends : [Text];
    skills : Skills;
    displayName : Text;
  };

  type LeaderboardEntry = {
    playerName : Text;
    score : Nat;
    principal : Text;
  };

  let profiles = Map.empty<Principal, PlayerProfile>();
  var leaderboard : [LeaderboardEntry] = [];

  let defaultSkills : Skills = { speed = 0; power = 0; agility = 0; spin = 0; hurdle = 0 };

  let defaultProfile : PlayerProfile = {
    xp = 0;
    hp = 100;
    level = 1;
    skillPoints = 0;
    highScore = 0;
    careerStage = #HighSchool;
    unlockedLegends = [];
    skills = defaultSkills;
    displayName = "Player";
  };

  func compareEntries(a : LeaderboardEntry, b : LeaderboardEntry) : Order.Order {
    if (a.score > b.score) #less
    else if (a.score < b.score) #greater
    else #equal
  };

  public shared(msg) func getProfile() : async PlayerProfile {
    switch (profiles.get(msg.caller)) {
      case (?p) p;
      case null defaultProfile;
    };
  };

  public shared(msg) func saveProfile(profile : PlayerProfile) : async () {
    profiles.add(msg.caller, profile);
  };

  public shared(msg) func upgradeSkill(skillName : Text) : async ?PlayerProfile {
    switch (profiles.get(msg.caller)) {
      case null null;
      case (?p) {
        if (p.skillPoints == 0) return null;
        let s = p.skills;
        let newSkillsOpt : ?Skills = switch (skillName) {
          case "speed"   ?({ speed = s.speed + 1; power = s.power; agility = s.agility; spin = s.spin; hurdle = s.hurdle });
          case "power"   ?({ speed = s.speed; power = s.power + 1; agility = s.agility; spin = s.spin; hurdle = s.hurdle });
          case "agility" ?({ speed = s.speed; power = s.power; agility = s.agility + 1; spin = s.spin; hurdle = s.hurdle });
          case "spin"    ?({ speed = s.speed; power = s.power; agility = s.agility; spin = s.spin + 1; hurdle = s.hurdle });
          case "hurdle"  ?({ speed = s.speed; power = s.power; agility = s.agility; spin = s.spin; hurdle = s.hurdle + 1 });
          case _         null;
        };
        switch (newSkillsOpt) {
          case null null;
          case (?newSkills) {
            let updated : PlayerProfile = {
              xp = p.xp;
              hp = p.hp;
              level = p.level;
              skillPoints = p.skillPoints - 1;
              highScore = p.highScore;
              careerStage = p.careerStage;
              unlockedLegends = p.unlockedLegends;
              skills = newSkills;
              displayName = p.displayName;
            };
            profiles.add(msg.caller, updated);
            ?updated;
          };
        };
      };
    };
  };

  public shared(msg) func unlockLegend(legendId : Text, xpCost : Nat) : async ?PlayerProfile {
    switch (profiles.get(msg.caller)) {
      case null null;
      case (?p) {
        if (p.xp < xpCost) return null;
        let alreadyUnlocked = p.unlockedLegends.find(func(id : Text) : Bool = id == legendId) != null;
        if (alreadyUnlocked) return ?p;
        let newLegends = p.unlockedLegends.concat([legendId]);
        let updated : PlayerProfile = {
          xp = p.xp - xpCost;
          hp = p.hp;
          level = p.level;
          skillPoints = p.skillPoints;
          highScore = p.highScore;
          careerStage = p.careerStage;
          unlockedLegends = newLegends;
          skills = p.skills;
          displayName = p.displayName;
        };
        profiles.add(msg.caller, updated);
        ?updated;
      };
    };
  };

  public shared(msg) func advanceCareer() : async ?PlayerProfile {
    switch (profiles.get(msg.caller)) {
      case null null;
      case (?p) {
        let nextStage : ?CareerStage = switch (p.careerStage) {
          case (#HighSchool) ?#College;
          case (#College)    ?#Pro;
          case (#Pro)        ?#SuperBowl;
          case (#SuperBowl)  ?#HallOfFame;
          case (#HallOfFame) null;
        };
        switch (nextStage) {
          case null null;
          case (?ns) {
            let updated : PlayerProfile = {
              xp = p.xp;
              hp = p.hp;
              level = p.level;
              skillPoints = p.skillPoints + 3;
              highScore = p.highScore;
              careerStage = ns;
              unlockedLegends = p.unlockedLegends;
              skills = p.skills;
              displayName = p.displayName;
            };
            profiles.add(msg.caller, updated);
            ?updated;
          };
        };
      };
    };
  };

  public shared(msg) func submitScore(score : Nat, playerName : Text) : async Nat {
    switch (profiles.get(msg.caller)) {
      case (?p) {
        if (score > p.highScore) {
          let updated : PlayerProfile = {
            xp = p.xp + score / 10;
            hp = p.hp;
            level = p.level;
            skillPoints = p.skillPoints;
            highScore = score;
            careerStage = p.careerStage;
            unlockedLegends = p.unlockedLegends;
            skills = p.skills;
            displayName = p.displayName;
          };
          profiles.add(msg.caller, updated);
        };
      };
      case null {};
    };

    let principalText = msg.caller.toText();
    let entry : LeaderboardEntry = { playerName = playerName; score = score; principal = principalText };
    let filtered = leaderboard.filter(func(e : LeaderboardEntry) : Bool = e.principal != principalText);
    let combined = filtered.concat([entry]);
    let sorted = combined.sort(compareEntries);
    let size = sorted.size();
    let top10 = if (size > 10) Array.tabulate(10, func(i : Nat) : LeaderboardEntry { sorted[i] }) else sorted;
    leaderboard := top10;
    score;
  };

  public query func getLeaderboard() : async [LeaderboardEntry] {
    leaderboard;
  };

  public shared(msg) func resetProfile(displayName : Text) : async PlayerProfile {
    let fresh : PlayerProfile = {
      xp = 0;
      hp = 100;
      level = 1;
      skillPoints = 0;
      highScore = 0;
      careerStage = #HighSchool;
      unlockedLegends = [];
      skills = defaultSkills;
      displayName = displayName;
    };
    profiles.add(msg.caller, fresh);
    fresh;
  };

  public shared(msg) func addXpAndLevel(xpGain : Nat) : async PlayerProfile {
    let p = switch (profiles.get(msg.caller)) {
      case (?existing) existing;
      case null defaultProfile;
    };
    let newXp = p.xp + xpGain;
    let newLevel = newXp / 100 + 1;
    let bonusSkillPoints = if (newLevel > p.level) Nat.sub(newLevel, p.level) else 0;
    let updated : PlayerProfile = {
      xp = newXp;
      hp = p.hp;
      level = newLevel;
      skillPoints = p.skillPoints + bonusSkillPoints;
      highScore = p.highScore;
      careerStage = p.careerStage;
      unlockedLegends = p.unlockedLegends;
      skills = p.skills;
      displayName = p.displayName;
    };
    profiles.add(msg.caller, updated);
    updated;
  };
}
