// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

/// @title An escrow contract with a third-party agent
/// @author SD17
/// @notice this contract holds some ether from a payer. Keeps it until the third-party agent desides to send the ether to the payee
contract EscrowWithAgent {
    address payable public payer; // payable: payer address needs to transfer the ether to own addrss, if un-successful
    address payable public payee; // payable: payees address needs to transfer the ether to own addrss, if successful
    address public agent;
    uint256 public amount;
    Stages public currentStage;

    // while checking for event's name in chai/truffleAssert
    // look for contractInstance.amount, contractInstance.currentStage
    // as amount, currentStage is the actual parameter name. Irrespective of the emit part
    event deposited(uint256 amount, Stages currentStage);
    event released(uint256 amount, Stages currentStage);
    event reverted(uint256 amount, Stages currentStage);
    event stageChange(Stages currentStage);

    // OPEN: escrow contract is open; the payer hasn't paid yet
    // ONGOING: escrow contract is open; payer has paid; payee didn't receive the ether
    // CLOSED: payee received the ether
    enum Stages {
        OPEN,
        ONGOING,
        CLOSED
    }


    constructor(
        address payable _payer,
        address payable _payee,
        address _agent,
        uint256 _amount
    ) {
        payer = _payer;
        payee = _payee;
        agent = _agent;
        amount = _amount;
        currentStage = Stages.OPEN;
        emit stageChange(currentStage);
    }

    function deposit() public payable {
        require(msg.sender == payer, "Sender must be the payer");
        require(currentStage == Stages.OPEN, "Wrong stage, see current stage");
        require(
            address(this).balance <= amount,
            "Cant send more than specified amount"
        );

        // can be paid in multiple intervals.
        // each time checking if the full amount is given or not
        // if given then change the stage
        if (address(this).balance >= amount) {
            currentStage = Stages.ONGOING;
            emit stageChange(currentStage);
        }
        emit deposited(amount, currentStage);
    }

    function release() public {
        require(msg.sender == agent, "Only agent can release funds");
        require(currentStage == Stages.ONGOING);
        payee.transfer(amount);
        currentStage = Stages.CLOSED;
        emit stageChange(currentStage);
        emit released(amount, currentStage);
    }

    function revertEscrow() public {
        require(msg.sender == agent, "Only agent can revert the contract");
        require(currentStage == Stages.ONGOING && currentStage == Stages.OPEN); // can only be reverted in these two stages
        payer.transfer(amount);
        currentStage = Stages.CLOSED;
        emit stageChange(currentStage);
        emit reverted(amount, currentStage);
    }

    function stageOf() public view returns (Stages) {
        return currentStage;
    }

    function balanceOf() public view returns (uint256) {
        return address(this).balance;
    }
}
